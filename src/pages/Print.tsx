import { Fragment } from 'react'
import { today } from '../lib/dates'
import { claimsFor, quoteNet } from '../lib/claims'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { computeCosting, money } from '../lib/costing'
import { invoiceTotals } from '../lib/invoicing'
import { shortAddress } from '../lib/address'
import { emptyCompany } from '../lib/company'
import EmailPanel from '../components/EmailPanel'
import type { CompanyProfile, CostCenter } from '../types'

const auDate = (iso: string) => (iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

// Address lines for a letterhead: "Street: ... • City/Suburb: ..." becomes two readable lines.
function addressLines(address: string): string[] {
  const m = /(?:Street|Postal):\s*(.*?)\s*•\s*City\/Suburb:\s*(.*?)\s*•\s*State:\s*.*?\((\w+)\)\s*•\s*Postcode:\s*(\d+)/.exec(address)
  return m ? [m[1], `${m[2]} ${m[3]} ${m[4]}`] : address ? [address] : []
}

function Letterhead({ company, fallbackName, title, number, rows }: {
  company: CompanyProfile; fallbackName: string; title: string; number: number; rows: [string, string][]
}) {
  return (
    <header className="doc-head">
      <div>
        <h2>{company.tradingName || fallbackName}</h2>
        {company.abn && <div>ABN {company.abn}</div>}
        {company.licence && <div>Licence {company.licence}</div>}
        {addressLines(company.address).map((l) => <div key={l}>{l}</div>)}
        {company.phone && <div>{company.phone}</div>}
        {company.email && <div>{company.email}</div>}
        {company.website && <div>{company.website}</div>}
      </div>
      <div className="doc-title">
        <h1>{title}</h1>
        {number > 0 && <div className="doc-no">#{number}</div>}
        <table className="doc-meta"><tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
      </div>
    </header>
  )
}

function Lines({ sections }: { sections: CostCenter[] }) {
  return (
    <table className="doc-table">
      <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
      <tbody>
        {sections.map((cc) => (
          <Fragment key={cc.id}>
            {sections.length > 1 && <tr className="doc-section"><td colSpan={4}>{cc.name}</td></tr>}
            {cc.items.map((i) => (
              <tr key={i.id}>
                <td>{i.description}</td>
                <td className="num">{i.quantity}{i.kind === 'labour' ? ' h' : ''}</td>
                <td className="num">{money(i.unitSell)}</td>
                <td className="num">{money(i.quantity * i.unitSell)}</td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

function Toolbar({ back, mailto }: { back: string; mailto?: string }) {
  return (
    <div className="no-print row" style={{ marginBottom: 12 }}>
      <Link to={back}>← Back</Link>
      <button className="primary" onClick={() => window.print()}>Print / Save as PDF</button>
      {mailto && <a className="btn" href={mailto}>Open in my email app</a>}
      <span className="muted">In the print window, choose "Save as PDF" as the destination.</span>
    </div>
  )
}

function Parties({ customerName, contact, address, siteName, siteAddress }: { customerName?: string; contact?: string; address?: string; siteName?: string; siteAddress?: string }) {
  return (
    <div className="doc-parties">
      <div>
        <h4>Bill to</h4>
        <b>{customerName}</b>
        {contact && <div>Attn: {contact}</div>}
        {addressLines(address ?? '').map((l) => <div key={l}>{l}</div>)}
      </div>
      <div>
        <h4>Job site</h4>
        <b>{siteName}</b>
        {addressLines(siteAddress ?? '').map((l) => <div key={l}>{l}</div>)}
      </div>
    </div>
  )
}

export function QuotePrint() {
  const { id } = useParams()
  const { db } = useStore()
  const q = db.quotes.find((x) => x.id === Number(id))
  if (!q) return <p>Quote not found.</p>
  const c = computeCosting(q)
  const customer = db.customers.find((x) => x.id === q.customerId)
  const site = db.sites.find((x) => x.id === q.siteId)
  const company = { ...emptyCompany, ...db.settings.company }
  const created = q.timeline[q.timeline.length - 1]?.at ?? q.updatedAt
  const valid = new Date(created); valid.setDate(valid.getDate() + 30)
  const subject = `Quote #${q.id} – ${q.name}`
  const body = `Hi ${customer?.contactName || customer?.name || ''},\n\nPlease find our quote #${q.id} (${q.name}) for ${money(c.total)} including GST. It is valid until ${auDate(valid.toISOString())}.\n\nKind regards,\n${company.tradingName || db.settings.companyName}${company.phone ? '\n' + company.phone : ''}`
  const mailto = customer?.email ? `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : undefined
  return (
    <>
      <Toolbar back={`/quotes/${q.id}`} mailto={mailto} />
      <EmailPanel kind="quote" id={q.id} to={customer?.email} defaultSubject={subject} defaultMessage={body} />
      <article className="doc">
        <Letterhead company={company} fallbackName={db.settings.companyName} title="QUOTE" number={q.id}
          rows={[['Date', auDate(created)], ['Valid until', auDate(valid.toISOString())]]} />
        <Parties customerName={customer?.name} contact={customer?.contactName} address={customer?.address} siteName={site?.name} siteAddress={site?.address} />
        <h3 className="doc-job">{q.name}</h3>
        {q.description && <p className="doc-scope">{q.description}</p>}
        <Lines sections={q.costCenters} />
        <table className="doc-totals"><tbody>
          <tr><td>Subtotal (ex GST)</td><td>{money(c.subTotal + q.discount)}</td></tr>
          {q.discount > 0 && <tr><td>Discount</td><td>-{money(q.discount)}</td></tr>}
          <tr><td>GST ({q.taxRate}%)</td><td>{money(c.tax)}</td></tr>
          <tr className="doc-grand"><td>Total (inc GST)</td><td>{money(c.total)}</td></tr>
        </tbody></table>
        {q.notes && <><h4>Notes</h4><p className="doc-scope">{q.notes}</p></>}
        <p className="doc-foot">To accept this quote, reply to this document or contact us. Prices are in Australian dollars and valid for 30 days.</p>
      </article>
    </>
  )
}

export function InvoicePrint() {
  const { id } = useParams()
  const { db } = useStore()
  const inv = db.invoices.find((x) => x.id === Number(id))
  if (!inv) return <p>Invoice not found.</p>
  const t = invoiceTotals(inv)
  const customer = db.customers.find((x) => x.id === inv.customerId)
  const site = db.sites.find((x) => x.id === inv.siteId)
  const job = db.jobs.find((j) => j.id === inv.jobId)
  const company = { ...emptyCompany, ...db.settings.company }
  const hasGst = inv.taxRate > 0
  const title = hasGst && company.abn ? 'TAX INVOICE' : 'INVOICE'
  const subject = `${title === 'TAX INVOICE' ? 'Tax invoice' : 'Invoice'} #${inv.id}${job ? ' – ' + job.name : ''}`
  const body = `Hi ${customer?.contactName || customer?.name || ''},\n\nPlease find invoice #${inv.id} for ${money(t.balance)} due ${auDate(inv.dueAt)}.${company.bsb ? `\n\nPay by bank transfer to BSB ${company.bsb}, account ${company.accountNumber}, reference ${inv.id}.` : ''}\n\nThank you,\n${company.tradingName || db.settings.companyName}${company.phone ? '\n' + company.phone : ''}`
  const mailto = customer?.email ? `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : undefined
  return (
    <>
      <Toolbar back={`/invoices/${inv.id}`} mailto={mailto} />
      <EmailPanel kind="invoice" id={inv.id} to={customer?.email} defaultSubject={subject} defaultMessage={body} />
      <article className="doc">
        <Letterhead company={company} fallbackName={db.settings.companyName} title={title} number={inv.id}
          rows={[['Issued', auDate(inv.issuedAt)], ['Due', auDate(inv.dueAt)], ...(job ? [['Job', `#${job.id}`] as [string, string]] : [])]} />
        {inv.voided && <div className="doc-void">VOID</div>}
        <Parties customerName={customer?.name} contact={customer?.contactName} address={customer?.address} siteName={site?.name} siteAddress={site?.address} />
        <h3 className="doc-job">{job?.name}</h3>
        <Lines sections={inv.sections} />
        {inv.claimPct != null && (() => {
          const q = db.quotes.find((x) => x.id === job?.quoteId)
          const upTo = claimsFor(db.invoices, inv.jobId).filter((c) => c.id <= inv.id).reduce((a, c) => a + (c.claimPct ?? 0), 0)
          if (!q) return null
          return (
            <table className="doc-totals"><tbody>
              <tr><td>Contract price (ex GST)</td><td>{money(quoteNet(q))}</td></tr>
              <tr><td>This claim: {inv.claimLabel} ({inv.claimPct}%)</td><td>{money(t.subTotal)}</td></tr>
              <tr><td>Claimed to date</td><td>{Math.round(upTo * 100) / 100}% ({money(quoteNet(q) * upTo / 100)})</td></tr>
              <tr><td>Remaining to claim</td><td>{Math.round((100 - upTo) * 100) / 100}%</td></tr>
            </tbody></table>
          )
        })()}
        <table className="doc-totals"><tbody>
          <tr><td>Subtotal (ex GST)</td><td>{money(t.subTotal + inv.discount)}</td></tr>
          {inv.discount > 0 && <tr><td>Discount</td><td>-{money(inv.discount)}</td></tr>}
          <tr><td>GST ({inv.taxRate}%)</td><td>{money(t.tax)}</td></tr>
          <tr className="doc-grand"><td>Total (inc GST)</td><td>{money(t.total)}</td></tr>
          {t.paid > 0 && <tr><td>Paid</td><td>-{money(t.paid)}</td></tr>}
          {t.credited > 0 && <tr><td>Credits</td><td>-{money(t.credited)}</td></tr>}
          <tr className="doc-grand"><td>Balance due</td><td>{money(t.balance)}</td></tr>
        </tbody></table>
        {(company.bsb || company.accountNumber) && (
          <div className="doc-pay">
            <h4>Pay by bank transfer</h4>
            <div>{[company.accountName, company.bankName].filter(Boolean).join(' · ')}</div>
            <div>BSB {company.bsb} · Account {company.accountNumber} · Reference {inv.id}</div>
          </div>
        )}
        {inv.notes && <><h4>Notes</h4><p className="doc-scope">{inv.notes}</p></>}
        {db.settings.invoiceFooter && <p className="doc-foot">{db.settings.invoiceFooter}</p>}
        {hasGst && !company.abn && <p className="doc-foot">Add your ABN under Settings to issue a valid tax invoice.</p>}
        <p className="doc-foot">{shortAddress(site?.address, site?.addressParts) && `Work carried out at ${shortAddress(site?.address, site?.addressParts)}.`}</p>
      </article>
    </>
  )
}

export function PoPrint() {
  const { id } = useParams()
  const { db } = useStore()
  const po = db.purchaseOrders.find((x) => x.id === Number(id))
  if (!po) return <p>Purchase order not found.</p>
  const company = { ...emptyCompany, ...db.settings.company }
  const total = po.lines.reduce((a, l) => a + l.qty * l.unitCost, 0)
  const gst = total * (db.settings.defaultTaxRate / 100)
  const part = (pid: string) => db.catalog.find((p) => p.id === pid)
  return (
    <>
      <Toolbar back="/materials/purchase-orders" />
      <article className="doc">
        <Letterhead company={company} fallbackName={db.settings.companyName} title="PURCHASE ORDER" number={po.id}
          rows={[['Date', auDate(po.createdAt)], ['Status', po.status]]} />
        <div className="doc-parties"><div><h4>Vendor</h4><b>{po.vendor}</b></div><div><h4>Deliver to</h4><b>{company.tradingName || db.settings.companyName}</b>{addressLines(company.address).map((l) => <div key={l}>{l}</div>)}</div></div>
        <table className="doc-table">
          <thead><tr><th>Part no.</th><th>Description</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {po.lines.map((l) => (
              <tr key={l.id}><td>{part(l.partId)?.partNo}</td><td>{part(l.partId)?.description ?? l.partId}</td><td className="num">{l.qty}</td><td className="num">{money(l.unitCost)}</td><td className="num">{money(l.qty * l.unitCost)}</td></tr>
            ))}
          </tbody>
        </table>
        <table className="doc-totals"><tbody>
          <tr><td>Subtotal (ex GST)</td><td>{money(total)}</td></tr>
          <tr><td>GST ({db.settings.defaultTaxRate}%)</td><td>{money(gst)}</td></tr>
          <tr className="doc-grand"><td>Total (inc GST)</td><td>{money(total + gst)}</td></tr>
        </tbody></table>
        <p className="doc-foot">Please quote PO {po.id} on your delivery docket and invoice. Prices are in Australian dollars.</p>
      </article>
    </>
  )
}

export function StatementPrint() {
  const { id } = useParams()
  const { db } = useStore()
  const c = db.customers.find((x) => x.id === id)
  if (!c) return <p>Customer not found.</p>
  const company = { ...emptyCompany, ...db.settings.company }
  const invs = db.invoices.filter((i) => i.customerId === c.id && !i.voided && i.stage !== 'draft').sort((a, b) => a.issuedAt.localeCompare(b.issuedAt))
  const rows = invs.map((i) => ({ i, t: invoiceTotals(i) }))
  const owing = rows.reduce((a, r) => a + r.t.balance, 0)
  const todayIso = today()
  return (
    <>
      <Toolbar back={`/customers/${c.id}`} />
      <article className="doc">
        <Letterhead company={company} fallbackName={db.settings.companyName} title="STATEMENT" number={0} rows={[['Date', auDate(todayIso)]]} />
        <div className="doc-parties"><div><h4>Customer</h4><b>{c.name}</b>{c.contactName && <div>Attn: {c.contactName}</div>}{addressLines(c.address).map((l) => <div key={l}>{l}</div>)}</div><div /></div>
        <table className="doc-table">
          <thead><tr><th>Invoice</th><th>Issued</th><th>Due</th><th className="num">Total</th><th className="num">Paid / credited</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {rows.map(({ i, t }) => (
              <tr key={i.id}><td>#{i.id}</td><td>{auDate(i.issuedAt)}</td><td>{auDate(i.dueAt)}{t.balance > 0.005 && i.dueAt < todayIso ? ' (overdue)' : ''}</td><td className="num">{money(t.total)}</td><td className="num">{money(t.paid + t.credited)}</td><td className="num">{money(t.balance)}</td></tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6}>No invoices have been issued to this customer.</td></tr>}
          </tbody>
        </table>
        <table className="doc-totals"><tbody><tr className="doc-grand"><td>Total owing (inc GST)</td><td>{money(owing)}</td></tr></tbody></table>
        {(company.bsb || company.accountNumber) && <p className="doc-foot">Pay by bank transfer: {company.accountName || company.tradingName} · BSB {company.bsb} · Account {company.accountNumber}{company.bankName ? ` (${company.bankName})` : ''}</p>}
      </article>
    </>
  )
}
