// Data for the customer's online quote page (/q/<token>). With Supabase it calls the public functions from
// migration 026 (no sign-in needed); in demo mode it reads and updates this browser's demo data.
import { supabase } from './supabase'
import type { Db } from '../types'

type SellItem = { description: string; quantity: number; unitSell: number; kind: string }
// A quote attachment the office ticked "Customer can see"
export type SharedFile = { id: string; name: string; size: number; type: string; dataUrl: string }
const shared = (list?: { id: string; name: string; size: number; type: string; dataUrl?: string; customerVisible?: boolean }[]): SharedFile[] =>
  (list ?? []).filter((a) => a.customerVisible === true && a.dataUrl).map((a) => ({ id: a.id, name: a.name, size: a.size, type: a.type, dataUrl: a.dataUrl as string }))
export interface PortalData {
  state: 'ok' | 'not_found' | 'revoked' | 'expired'
  company?: { name: string; abn: string; licence: string; phone: string; email: string; website: string; address: string }
  customer?: { name: string; contactName: string; address: string }
  site?: { name: string; address: string }
  quote?: { id: number; name: string; status: string; description: string; date: string; discount: number; taxRate: number; sections: { name: string; items: SellItem[] }[] }
  link?: { expiresAt: string; decision: 'accepted' | 'declined' | null; decidedAt: string | null; signerName: string }
  attachments?: SharedFile[]
}

const KEY = 'fieldwork.db.v1'
const readLocal = (): Db | null => { try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as Db) : null } catch { return null } }
const valid = (t: string) => /^[0-9a-f]{64}$/.test(t)

export async function loadQuotePortal(token: string): Promise<PortalData> {
  if (!valid(token)) return { state: 'not_found' }
  if (supabase) {
    const { data, error } = await supabase.rpc('quote_portal', { p_token: token })
    if (error) throw new Error('We could not load this quote. Check your connection and try again.')
    return data as PortalData
  }
  const db = readLocal()
  const l = db?.quoteLinks?.find((x) => x.token === token)
  if (!db || !l) return { state: 'not_found' }
  if (l.revokedAt) return { state: 'revoked' }
  if (!l.decision && new Date(l.expiresAt).getTime() < Date.now()) return { state: 'expired' }
  const q = db.quotes.find((x) => x.id === l.quoteId)
  if (!q) return { state: 'not_found' }
  const cu = db.customers.find((c) => c.id === q.customerId)
  const si = db.sites.find((s) => s.id === q.siteId)
  const p = db.settings.company
  return {
    state: 'ok',
    company: { name: p?.tradingName || db.settings.companyName, abn: p?.abn ?? '', licence: p?.licence ?? '', phone: p?.phone ?? '', email: p?.email ?? '', website: p?.website ?? '', address: p?.address ?? '' },
    customer: { name: cu?.name ?? '', contactName: cu?.contactName ?? '', address: cu?.address ?? '' },
    site: { name: si?.name ?? '', address: si?.address ?? '' },
    quote: {
      id: q.id, name: q.name, status: q.status, description: q.description, date: q.timeline[q.timeline.length - 1]?.at ?? q.updatedAt,
      discount: q.discount, taxRate: q.taxRate,
      sections: q.costCenters.map((c) => ({ name: c.name, items: c.items.map((i) => ({ description: i.description, quantity: i.quantity, unitSell: i.unitSell, kind: i.kind })) })),
    },
    link: { expiresAt: l.expiresAt, decision: l.decision ?? null, decidedAt: l.decidedAt ?? null, signerName: l.signerName ?? '' },
    attachments: shared(q.attachments),
  }
}

// Returns an error message, or null when the decision was recorded.
export async function decideQuote(token: string, decision: 'accepted' | 'declined', name: string, note: string): Promise<string | null> {
  const nm = name.trim()
  if (nm.length < 2) return 'Type your full name.'
  if (supabase) {
    const { error } = await supabase.rpc('quote_portal_decide', { p_token: token, p_decision: decision, p_name: nm, p_note: note.trim() })
    return error ? error.message : null
  }
  const db = readLocal()
  const l = db?.quoteLinks?.find((x) => x.token === token)
  const q = l && db?.quotes.find((x) => x.id === l.quoteId)
  if (!db || !l || !q || l.revokedAt) return 'This link is no longer active. Please contact us.'
  if (l.decision) return 'A decision has already been recorded for this quote.'
  if (q.status === 'approved' || q.status === 'declined') return `This quote has already been ${q.status}. Please contact us if anything has changed.`
  const at = new Date().toISOString()
  Object.assign(l, { decision, decidedAt: at, signerName: nm, signerNote: note.trim() })
  q.status = decision === 'accepted' ? 'approved' : 'declined'
  q.updatedAt = at
  q.timeline = [{ id: crypto.randomUUID(), type: 'Customer', message: decision === 'accepted' ? `Accepted online by ${nm}` : `Declined online by ${nm}${note.trim() ? ': ' + note.trim() : ''}`, at }, ...q.timeline]
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { return 'Could not save your answer in this browser.' }
  return null
}

// ---- customer portal (/p/<token>): read-only invoices, quotes and statement
type SellSection = { name: string; items: SellItem[] }
export interface AccountData {
  state: 'ok' | 'not_found' | 'revoked' | 'expired'
  company?: { name: string; abn: string; licence: string; phone: string; email: string; website: string; address: string; bankName: string; accountName: string; bsb: string; accountNumber: string; invoiceFooter: string }
  customer?: { name: string; contactName: string; address: string }
  expiresAt?: string
  invoices?: { id: number; issuedAt: string; dueAt: string; taxRate: number; discount: number; claimLabel?: string | null; claimPct?: number | null; job: string; site: { name?: string; address?: string }; sections: SellSection[]; payments: { amount: number; date: string }[]; credits: { amount: number; date: string }[] }[]
  quotes?: { id: number; name: string; status: string; description: string; date: string; discount: number; taxRate: number; site: { name?: string; address?: string }; acceptToken?: string | null; sections: SellSection[]; attachments?: SharedFile[] }[]
}

export async function loadCustomerPortal(token: string): Promise<AccountData> {
  if (!valid(token)) return { state: 'not_found' }
  if (supabase) {
    const { data, error } = await supabase.rpc('customer_portal', { p_token: token })
    if (error) throw new Error('We could not load your account. Check your connection and try again.')
    return data as AccountData
  }
  const db = readLocal()
  const l = db?.customerLinks?.find((x) => x.token === token)
  if (!db || !l) return { state: 'not_found' }
  if (l.revokedAt) return { state: 'revoked' }
  if (new Date(l.expiresAt).getTime() < Date.now()) return { state: 'expired' }
  const cu = db.customers.find((c) => c.id === l.customerId)
  if (!cu) return { state: 'not_found' }
  const p = db.settings.company
  const sell = (cc: { name: string; items: { description: string; quantity: number; unitSell: number; kind: string }[] }[]) =>
    cc.map((c) => ({ name: c.name, items: c.items.map((i) => ({ description: i.description, quantity: i.quantity, unitSell: i.unitSell, kind: i.kind })) }))
  const siteOf = (id: string) => { const s = db.sites.find((x) => x.id === id); return s ? { name: s.name, address: s.address } : {} }
  const now = Date.now()
  return {
    state: 'ok',
    company: { name: p?.tradingName || db.settings.companyName, abn: p?.abn ?? '', licence: p?.licence ?? '', phone: p?.phone ?? '', email: p?.email ?? '', website: p?.website ?? '', address: p?.address ?? '', bankName: p?.bankName ?? '', accountName: p?.accountName ?? '', bsb: p?.bsb ?? '', accountNumber: p?.accountNumber ?? '', invoiceFooter: db.settings.invoiceFooter ?? '' },
    customer: { name: cu.name, contactName: cu.contactName ?? '', address: cu.address ?? '' },
    expiresAt: l.expiresAt,
    invoices: db.invoices.filter((i) => i.customerId === cu.id && i.stage !== 'draft' && !i.voided).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.id - a.id).map((i) => ({
      id: i.id, issuedAt: i.issuedAt, dueAt: i.dueAt, taxRate: i.taxRate, discount: i.discount, claimLabel: i.claimLabel, claimPct: i.claimPct,
      job: db.jobs.find((j) => j.id === i.jobId)?.name ?? '', site: siteOf(i.siteId), sections: sell(i.sections),
      payments: i.payments.map((x) => ({ amount: x.amount, date: x.date })), credits: (i.credits ?? []).map((x) => ({ amount: x.amount, date: x.date })),
    })),
    quotes: db.quotes.filter((q) => q.customerId === cu.id && q.status !== 'to_be_completed').map((q) => ({
      id: q.id, name: q.name, status: q.status, description: q.description, date: q.timeline[q.timeline.length - 1]?.at ?? q.updatedAt,
      discount: q.discount, taxRate: q.taxRate, site: siteOf(q.siteId), sections: sell(q.costCenters),
      acceptToken: (db.quoteLinks ?? []).find((k) => k.quoteId === q.id && !k.revokedAt && !k.decision && new Date(k.expiresAt).getTime() > now)?.token ?? null,
      attachments: shared(q.attachments),
    })),
  }
}
