import { supabase } from './supabase'
import { seed } from '../data/mock'
import type { Db } from '../types'

export interface Profile {
  role: 'admin' | 'accounts' | 'sales' | 'dispatcher' | 'technician' | 'readonly'
  fullName: string
}

export function emptyDb(): Db {
  return {
    settings: seed.settings,
    customers: [],
    leads: [],
    recurring: [],
    vendorQuotes: [],
    receipts: [],
    sites: [],
    catalog: [],
    quotes: [],
    jobs: [],
    invoices: [],
    employees: [],
    schedule: [],
    timesheetLock: { on: false, until: '' },
    reminders: [],
    audits: [],
    auditResults: [],
    preBuilds: [],
    purchaseOrders: [],
    counts: [],
    jobNotes: [],
    jobCosts: [],
    clock: [],
    jobPhotos: [],
    assets: [],
  }
}

export function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  return String(e)
}

// One round trip: the load_all() database function returns everything the signed-in user's company can see,
// already shaped like the app's Db type.
export async function loadRemote(): Promise<{ db: Db; profile: Profile | null }> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('load_all')
  if (error) throw error
  const { profile, ...rest } = (data ?? {}) as Partial<Db> & { profile?: Profile }
  const base = emptyDb()
  return {
    db: { ...base, ...rest, settings: { ...base.settings, ...(rest.settings ?? {}) } },
    profile: profile ?? null,
  }
}
