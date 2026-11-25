import type { Invoice, Quote } from '../types'

// Progress claims: a job billed in stages (deposit, progress, completion), each a percentage of the quote price.
export const claimsFor = (invoices: Invoice[], jobId: number) => invoices.filter((i) => i.jobId === jobId && !i.voided && i.claimPct != null)
export const claimedPct = (invoices: Invoice[], jobId: number) => claimsFor(invoices, jobId).reduce((a, i) => a + (i.claimPct ?? 0), 0)

// Quote price after discount, before GST: the base that claim percentages apply to.
export const quoteNet = (q: Quote) => q.costCenters.reduce((a, c) => a + c.items.reduce((b, i) => b + i.quantity * i.unitSell, 0), 0) - q.discount

export const CLAIM_LABELS = ['Deposit', 'Progress claim', 'Completion']
