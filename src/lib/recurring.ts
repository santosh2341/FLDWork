import type { RecurringJob } from '../types'
import { addDays, fmtDate, parseDate } from './dates'

export const FREQ_LABEL: Record<RecurringJob['frequency'], string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
}

// Next due date after `date`. Month steps keep the day, clamped to the end of shorter months.
export function advance(date: string, freq: RecurringJob['frequency']): string {
  if (freq === 'weekly') return addDays(date, 7)
  if (freq === 'fortnightly') return addDays(date, 14)
  const d = parseDate(date)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + (freq === 'monthly' ? 1 : 3))
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return fmtDate(d)
}
