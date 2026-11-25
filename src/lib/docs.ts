// What a customer-facing quote or invoice says, independent of how it is drawn.
// The PDF (lib/pdf.ts) and the online quote page (pages/QuotePortal.tsx) both use this, so they always agree.
// Only selling prices go in here: never costs, markups or the quote's private notes.
import type { CompanyProfile, CostCenter, Db, Invoice, Quote } from '../types'
import { emptyCompany } from './company'
import { claimsFor, quoteNet } from './claims'
import { invoiceTotals } from './invoicing'
import { money } from './costing'

export interface DocLine { description: string; qty: string; unit: number; amount: number }
export interface DocModel {
  title: string // QUOTE, TAX INVOICE or INVOICE
  number: number
  company: { name: string; lines: string[] }
  meta: [string, string][]
  billTo: { name: string; lines: string[] }
  site: { name: string; lines: string[] } | null
  heading: string
  scope: string
  sections: { name: string; items: DocLine[] }[]
  claim: [string, string][] // progress claim summary, empty when not a claim
  totals: { label: string; value: string; strong?: boolean }[]
  pay: string[] // bank transfer lines
  notes: string
  footer: string[]
  voided: boolean
  fileName: string
}

export const auDate = (iso?: string | null) =>
  iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

// "Street: … • City/Suburb: … • State: … (VIC) • Postcode: 3000" becomes two readable lines.
export function addressLines(address?: string): string[] {
  const a = address ?? ''
  const m = /(?:Street|Postal):\s*(.*?)\s*•\s*City\/Suburb:\s*(.*?)\s*•\s*State:\s*.*?\((\w+)\)\s*•\s*Postcode:\s*(\d+)/.exec(a)
  return m ? [m[1], `${m[2]} ${m[3]} ${m[4]}`] : a ? [a] : []
}

export function companyBlock(c: Partial<CompanyProfile>, fallbackName: string) {
  const p = { ...emptyCompany, ...c }
  return {
    name: p.tradingName || fallbackName || 'Our company',
    lines: [p.abn && `ABN ${p.abn}`, p.licence && `Licence ${p.licence}`, ...addressLines(p.address), p.phone, p.email, p.website].filter(Boolean) as string[],
  }
}

type SellItem = { description: string; quantity: number; unitSell: number; kind: string }
const docSections = (sections: { name: string; items: SellItem[] }[]) =>
  sections.map((s) => ({
    name: s.name,
    items: s.items.map((i) => ({ description: i.description, qty: `${i.quantity}${i.kind === 'labour' ? ' h' : ''}`, unit: i.unitSell, amount: i.quantity * i.unitSell })),
  }))

// Totals at selling prices: subtotal - discount, plus GST. Same result as computeCosting / invoiceTotals.
export function sellTotals(sections: { items: { quantity: number; unitSell: number }[] }[], discount: number, taxRate: number) {
  const gross = sections.reduce((a, s) => a + s.items.reduce((b, i) => b + i.quantity * i.unitSell, 0), 0)
  const net = gross - discount
  const tax = net * (taxRate / 100)
  return { gross, net, tax, total: net + tax }
}

const quoteValidUntil = (created: string) => { const v = new Date(created); v.setDate(v.getDate() + 30); return v.toISOString() }

// The quote as the customer sees it. `parts` lets the online page build it from what the server returned.
export function quoteDocFrom(parts: {
  company: { name: string; lines: string[] }
  id: number; name: string; description: string; created: string; discount: number; taxRate: number
  sections: { name: string; items: SellItem[] }[]
  customer: { name: string; contactName?: string; address?: string }
  site: { name: string; address?: string } | null
}): DocModel {
  const t = sellTotals(parts.sections, parts.discount, parts.taxRate)
  return {
    title: 'QUOTE', number: parts.id, company: parts.company,
    meta: [['Date', auDate(parts.created)], ['Valid until', auDate(quoteValidUntil(parts.created))]],
    billTo: { name: parts.customer.name, lines: [parts.customer.contactName && `Attn: ${parts.customer.contactName}`, ...addressLines(parts.customer.address)].filter(Boolean) as string[] },
    site: parts.site && parts.site.name ? { name: parts.site.name, lines: addressLines(parts.site.address) } : null,
    heading: parts.name, scope: parts.description,
    sections: docSections(parts.sections), claim: [],
    totals: [
      { label: 'Subtotal (ex GST)', value: money(t.gross) },
      ...(parts.discount > 0 ? [{ label: 'Discount', value: `-${money(parts.discount)}` }] : []),
      { label: `GST (${parts.taxRate}%)`, value: money(t.tax) },
      { label: 'Total (inc GST)', value: money(t.total), strong: true },
    ],
    pay: [], notes: '',
    footer: ['Prices are in Australian dollars and valid for 30 days.'],
    voided: false,
    fileName: `Quote-${parts.id}.pdf`,
  }
}

const sellOf = (cc: CostCenter[]) => cc.map((c) => ({ name: c.name, items: c.items.map((i) => ({ description: i.description, quantity: i.quantity, unitSell: i.unitSell, kind: i.kind })) }))

export function quoteDoc(db: Db, q: Quote): DocModel {
  const customer = db.customers.find((x) => x.id === q.customerId)
  const site = db.sites.find((x) => x.id === q.siteId)
  const created = q.timeline[q.timeline.length - 1]?.at ?? q.updatedAt
  return quoteDocFrom({
    company: companyBlock(db.settings.company ?? {}, db.settings.companyName),
    id: q.id, name: q.name, description: q.description, created, discount: q.discount, taxRate: q.taxRate,
    sections: sellOf(q.costCenters),
    customer: { name: customer?.name ?? '', contactName: customer?.contactName, address: customer?.address },
    site: site ? { name: site.name, address: site.address } : null,
  })
}

export function invoiceDoc(db: Db, inv: Invoice): DocModel {
  const t = invoiceTotals(inv)
  const customer = db.customers.find((x) => x.id === inv.customerId)
  const site = db.sites.find((x) => x.id === inv.siteId)
  const job = db.jobs.find((j) => j.id === inv.jobId)
  const company = { ...emptyCompany, ...db.settings.company }
  const title = inv.taxRate > 0 && company.abn ? 'TAX INVOICE' : 'INVOICE'
  const claim: [string, string][] = []
  if (inv.claimPct != null) {
    const q = db.quotes.find((x) => x.id === job?.quoteId)
    if (q) {
      const upTo = claimsFor(db.invoices, inv.jobId).filter((c) => c.id <= inv.id).reduce((a, c) => a + (c.claimPct ?? 0), 0)
      claim.push(['Contract price (ex GST)', money(quoteNet(q))], [`This claim: ${inv.claimLabel} (${inv.claimPct}%)`, money(t.subTotal)],
        ['Claimed to date', `${Math.round(upTo * 100) / 100}% (${money((quoteNet(q) * upTo) / 100)})`], ['Remaining to claim', `${Math.round((100 - upTo) * 100) / 100}%`])
    }
  }
  return {
    title, number: inv.id, company: companyBlock(company, db.settings.companyName),
    meta: [['Issued', auDate(inv.issuedAt)], ['Due', auDate(inv.dueAt)], ...(job ? [['Job', `#${job.id}`] as [string, string]] : [])],
    billTo: { name: customer?.name ?? '', lines: [customer?.contactName && `Attn: ${customer.contactName}`, ...addressLines(customer?.address)].filter(Boolean) as string[] },
    site: site ? { name: site.name, lines: addressLines(site.address) } : null,
    heading: job?.name ?? '', scope: '',
    sections: docSections(sellOf(inv.sections)), claim,
    totals: [
      { label: 'Subtotal (ex GST)', value: money(t.subTotal + inv.discount) },
      ...(inv.discount > 0 ? [{ label: 'Discount', value: `-${money(inv.discount)}` }] : []),
      { label: `GST (${inv.taxRate}%)`, value: money(t.tax) },
      { label: 'Total (inc GST)', value: money(t.total), strong: true },
      ...(t.paid > 0 ? [{ label: 'Paid', value: `-${money(t.paid)}` }] : []),
      ...(t.credited > 0 ? [{ label: 'Credits', value: `-${money(t.credited)}` }] : []),
      { label: 'Balance due', value: money(t.balance), strong: true },
    ],
    pay: company.bsb || company.accountNumber
      ? [[company.accountName, company.bankName].filter(Boolean).join(' · '), `BSB ${company.bsb} · Account ${company.accountNumber} · Reference ${inv.id}`].filter(Boolean)
      : [],
    notes: inv.notes ?? '',
    footer: [db.settings.invoiceFooter, 'All amounts are in Australian dollars.'].filter(Boolean) as string[],
    voided: inv.voided,
    fileName: `${title === 'TAX INVOICE' ? 'Tax-invoice' : 'Invoice'}-${inv.id}.pdf`,
  }
}

// Builds the real PDF on demand (pdf-lib is loaded only when someone asks for it).
export async function makePdf(doc: DocModel): Promise<Uint8Array> {
  const { docPdf } = await import('./pdf')
  return docPdf(doc)
}

// The invoice as the customer sees it, from plain parts (used by the customer portal).
export function invoiceDocFrom(parts: {
  company: { name: string; lines: string[] }; abn: string
  id: number; issuedAt: string; dueAt: string; job: string; taxRate: number; discount: number
  claimLabel?: string | null; claimPct?: number | null
  sections: { name: string; items: SellItem[] }[]
  paid: number; credited: number
  customer: { name: string; contactName?: string; address?: string }
  site: { name: string; address?: string } | null
  pay: string[]; footer: string
}): DocModel {
  const t = sellTotals(parts.sections, parts.discount, parts.taxRate)
  const balance = t.total - parts.paid - parts.credited
  const title = parts.taxRate > 0 && parts.abn ? 'TAX INVOICE' : 'INVOICE'
  return {
    title, number: parts.id, company: parts.company,
    meta: [['Issued', auDate(parts.issuedAt)], ['Due', auDate(parts.dueAt)]],
    billTo: { name: parts.customer.name, lines: [parts.customer.contactName && `Attn: ${parts.customer.contactName}`, ...addressLines(parts.customer.address)].filter(Boolean) as string[] },
    site: parts.site && parts.site.name ? { name: parts.site.name, lines: addressLines(parts.site.address) } : null,
    heading: [parts.job, parts.claimPct != null ? `${parts.claimLabel ?? 'Progress claim'} (${parts.claimPct}%)` : ''].filter(Boolean).join(' – '), scope: '',
    sections: docSections(parts.sections), claim: [],
    totals: [
      { label: 'Subtotal (ex GST)', value: money(t.gross) },
      ...(parts.discount > 0 ? [{ label: 'Discount', value: `-${money(parts.discount)}` }] : []),
      { label: `GST (${parts.taxRate}%)`, value: money(t.tax) },
      { label: 'Total (inc GST)', value: money(t.total), strong: true },
      ...(parts.paid > 0 ? [{ label: 'Paid', value: `-${money(parts.paid)}` }] : []),
      ...(parts.credited > 0 ? [{ label: 'Credits', value: `-${money(parts.credited)}` }] : []),
      { label: 'Balance due', value: money(balance), strong: true },
    ],
    pay: parts.pay, notes: '',
    footer: [parts.footer, 'All amounts are in Australian dollars.'].filter(Boolean),
    voided: false,
    fileName: `${title === 'TAX INVOICE' ? 'Tax-invoice' : 'Invoice'}-${parts.id}.pdf`,
  }
}
