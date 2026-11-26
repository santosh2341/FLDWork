import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './auth'
import { seed } from './data/mock'
import { supabase } from './lib/supabase'
import { emptyDb, errMsg, loadRemote } from './lib/remote'
import type { Profile } from './lib/remote'
import { makeLocalActions } from './storeLocal'
import { makeRemoteActions } from './storeRemote'
import type { Actions } from './storeTypes'
import { StoreCtx } from './store'
import type { Ctx, OpenTab } from './store'
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

  // local mode: another tab changed the data (for example the customer's quote page in the same browser), so use it
  useEffect(() => {
    if (remote) return
    const onStorage = (e: StorageEvent) => { if (e.key === KEY && e.newValue) setDb(loadLocal()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [remote])

  const reload = useCallback(async () => {
    try {
      const r = await loadRemote()
      dbRef.current = r.db // so actions that run right after a reload see the new data before React re-renders
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
    // oxlint-disable-next-line react/set-state-in-effect -- reload() sets state only after awaiting the network
    void reload()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [remote, userId, reload])

  // remote mode: changes made outside this tab (a customer accepting a quote online, a card payment recorded by
  // Stripe, a colleague saving) while the tab stays open. Every 30 s, and when the window gets focus, ask the
  // database whether anything is newer than what we hold; only then reload everything.
  useEffect(() => {
    if (!remote || !userId || !supabase) return
    const sb = supabase
    const newest = (xs: (string | undefined)[]) => xs.reduce<string>((m, x) => (x && x > m ? x : m), '1970-01-01T00:00:00Z')
    let busy = false
    const check = async () => {
      if (busy || document.visibilityState !== 'visible') return
      busy = true
      try {
        const db = dbRef.current
        const q = newest(db.quotes.map((x) => x.updatedAt))
        const l = newest(db.invoices.flatMap((i) => (i.log ?? []).map((e) => e.at)))
        const [a, b] = await Promise.all([
          sb.from('quotes').select('id').gt('updated_at', q).limit(1),
          sb.from('invoice_log').select('id').gt('created_at', l).limit(1),
        ])
        if ((a.data?.length ?? 0) > 0 || (b.data?.length ?? 0) > 0) await reload()
      } finally { busy = false }
    }
    const timer = window.setInterval(() => void check(), 30_000)
    const onFocus = () => void check()
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
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

  const getDb = useCallback(() => dbRef.current, [])
  const remoteActions = useMemo(
    () =>
      remote && supabase
        // oxlint-disable-next-line react/refs -- getDb is only called inside action handlers, never during render
        ? makeRemoteActions({ getDb, setDb, sb: supabase, companyId, reload, fail: setNotice })
        : null,
    [remote, companyId, reload, getDb],
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
