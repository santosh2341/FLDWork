import { createContext, useContext } from 'react'
import type { Profile } from './lib/remote'
import type { Actions } from './storeTypes'
import type { Db } from './types'

// The app's data and actions. StoreProvider (StoreProvider.tsx) fills this in for local or Supabase mode.
export interface OpenTab {
  path: string
  title: string
}

export interface Ctx extends Actions {
  db: Db
  tabs: OpenTab[]
  openTab: (t: OpenTab) => void
  closeTab: (path: string) => void
  remote: boolean // true when connected to Supabase
  canWrite: boolean // false for technician / read-only users (the database enforces this too)
  profile: Profile | null // signed-in user's name and role (remote only)
  notice: string // last error from the database, shown as a banner
  dismissNotice: () => void
  seedDemoData: () => Promise<void> // fills an empty company with sample records (remote only)
}

export const StoreCtx = createContext<Ctx | null>(null)

export function useStore() {
  const c = useContext(StoreCtx)
  if (!c) throw new Error('useStore outside StoreProvider')
  return c
}
