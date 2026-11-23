import type { Asset } from '../types'

export const CATEGORIES = ['Air conditioning / HVAC', 'Refrigeration', 'Fire panel / alarm', 'Extinguishers / hydrants', 'Switchboard / electrical', 'Backflow / plumbing', 'Hot water', 'Security / CCTV', 'Lift / door', 'Generator', 'Other'] as const

export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Add whole months to a yyyy-mm-dd date, clamping to the end of shorter months (31 Jan + 1 month = 28/29 Feb).
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(y, m - 1 + months, 1)
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  t.setDate(Math.min(d, last))
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export type DueState = 'overdue' | 'soon' | 'ok' | 'none'
// "soon" = due within the next 30 days.
export function dueState(a: Pick<Asset, 'nextDue' | 'active'>, today = todayIso()): DueState {
  if (!a.active || !a.nextDue) return 'none'
  if (a.nextDue < today) return 'overdue'
  return a.nextDue <= addDays(today, 30) ? 'soon' : 'ok'
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const DUE_LABEL: Record<DueState, string> = { overdue: 'Overdue', soon: 'Due soon', ok: 'Up to date', none: '–' }
