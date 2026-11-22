import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './auth'
import { seed } from './data/mock'
import { supabase } from './lib/supabase'
import { emptyDb, errMsg, loadRemote } from './lib/remote'
import type { Profile } from './lib/remote'
import { makeLocalActions } from './storeLocal'
import { makeRemoteActions } from './storeRemote'
import type { Actions } from './storeTypes'
import type { Db } from './types'

const KEY = 'fieldwork.db.v1'

function loadLocal(): Db {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...seed, ...(JSON.parse(raw) as Partial<Db>) } as Db
  } catch {
    /* ignore */
  }
  return seed
}

export interface OpenTab {
  path: string
  title: string
}

interface Ctx extends Actions {
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

const StoreCtx = createContext<Ctx | null>(null)
const MAX_TABS = 8

export function StoreProvider({ children }: { children: ReactNode }) {
  const { remote, session } = useAuth()
  const userId = session?.user.id
  const [db, setDb] = useState<Db>(() => (remote ? emptyDb() : loadLocal()))
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(remote)
  const [notice, setNotice] = useState('')
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const dbRef = useRef(db)
  const companyIdRef = useRef<string | null>(null)

  useEffect(() => {
    dbRef.current = db
  }, [db])

  // local mode: keep the data in the browser
  useEffect(() => {
    if (remote) return
    try {
      localStorage.setItem(KEY, JSON.stringify(db))
    } catch {
      /* ignore */
    }
  }, [db, remote])

  const reload = useCallback(async () => {
    try {
      const r = await loadRemote()
      setDb(r.db)
      setProfile(r.profile)
    } catch (e) {
      setNotice(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // remote mode: load on sign-in, and again whenever the tab regains focus (picks up other people's changes)
  useEffect(() => {
    if (!remote || !userId) return
    void reload()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [remote, userId, reload])

  const companyId = useCallback(async () => {
    if (companyIdRef.current) return companyIdRef.current
    if (!supabase) return null
    const { data } = await supabase.from('companies').select('id').limit(1).maybeSingle()
    companyIdRef.current = (data?.id as string | undefined) ?? null
    return companyIdRef.current
  }, [])

  const openTab = useCallback((t: OpenTab) => {
    setTabs((cur) => {
      const found = cur.find((x) => x.path === t.path)
      if (found) return cur.map((x) => (x.path === t.path ? t : x))
      const next = [...cur, t]
      return next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next
    })
  }, [])

  const closeTab = useCallback((path: string) => {
    setTabs((cur) => cur.filter((x) => x.path !== path))
  }, [])

  const remoteActions = useMemo(
    () =>
      remote && supabase
        ? makeRemoteActions({ getDb: () => dbRef.current, setDb, sb: supabase, companyId, reload, fail: setNotice })
        : null,
    [remote, companyId, reload],
  )
  const localActions = useMemo(() => (remote ? null : makeLocalActions(db, setDb)), [remote, db])
  const actions = (remoteActions ?? localActions) as Actions

  const seedDemoData = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.rpc('seed_demo_data')
    if (error) setNotice(error.message)
    await reload()
  }, [reload])

  const canWrite = !remote || (!!profile && ['admin', 'accounts', 'sales', 'dispatcher'].includes(profile.role))
  const value = useMemo<Ctx>(
    () => ({
      ...actions,
      db,
      tabs,
      openTab,
      closeTab,
      remote,
      canWrite,
      profile,
      notice,
      dismissNotice: () => setNotice(''),
      seedDemoData,
    }),
    [actions, db, tabs, openTab, closeTab, remote, canWrite, profile, notice, seedDemoData],
  )

  if (remote && loading) return <div className="center muted">Loading your data…</div>
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const c = useContext(StoreCtx)
  if (!c) throw new Error('useStore outside StoreProvider')
  return c
}
