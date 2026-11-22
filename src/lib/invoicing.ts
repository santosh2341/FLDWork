import type { Invoice } from '../types'

export interface InvoiceTotals {
  subTotal: number
  tax: number
  total: number
  paid: number
  credited: number
  balance: number
}

export function invoiceTotals(inv: Invoice): InvoiceTotals {
  let subTotal = -inv.discount
  for (const s of inv.sections) for (const i of s.items) subTotal += i.quantity * i.unitSell
  const tax = subTotal * (inv.taxRate / 100)
  const total = subTotal + tax
  const paid = inv.payments.reduce((a, p) => a + p.amount, 0)
  const credited = (inv.credits ?? []).reduce((a, c) => a + c.amount, 0)
  return { subTotal, tax, total, paid, credited, balance: total - paid - credited }
}

export const daysOverdue = (inv: Invoice, today = new Date()) => {
  const due = new Date(inv.dueAt + 'T00:00:00')
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000))
}

export type InvoiceState = 'void' | 'paid' | 'partial' | 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd91'

export function invoiceState(inv: Invoice): InvoiceState {
  if (inv.voided) return 'void'
  const t = invoiceTotals(inv)
  if (t.balance <= 0.005 && t.total > 0) return 'paid'
  const d = daysOverdue(inv)
  if (d > 90) return 'd91'
  if (d > 60) return 'd61_90'
  if (d > 30) return 'd31_60'
  if (d > 0) return 'd1_30'
  return t.paid > 0 ? 'partial' : 'current'
}

export const STATE_LABEL: Record<InvoiceState, string> = {
  void: 'Void',
  paid: 'Paid',
  partial: 'Partially paid',
  current: 'Current',
  d1_30: '1-30 days overdue',
  d31_60: '31-60 days overdue',
  d61_90: '61-90 days overdue',
  d91: '91+ days overdue',
}

export const STATE_COLOR: Record<InvoiceState, string> = {
  void: '#8a949e',
  paid: '#2e9e5b',
  partial: '#7fbf3f',
  current: '#2e9e5b',
  d1_30: '#e0a100',
  d31_60: '#e07a00',
  d61_90: '#d1453b',
  d91: '#a31d1d',
}

export const isUnpaid = (inv: Invoice) => {
  const s = invoiceState(inv)
  return s !== 'paid' && s !== 'void'
}

// Returns a copy of the invoice with a new entry at the top of its change log.
export const withLog = (inv: Invoice, message: string): Invoice => ({
  ...inv,
  log: [{ id: crypto.randomUUID(), at: new Date().toISOString(), message }, ...(inv.log ?? [])],
})
