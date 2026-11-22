import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { errMsg } from './lib/remote'

interface AuthCtx {
  remote: boolean // false = no Supabase env vars, app runs on local demo data
  ready: boolean // the first session check has finished
  session: Session | null
  signIn: (email: string, password: string) => Promise<string | null>
  // returns an error message, 'confirm' when an email must be confirmed first, or null when signed in
  signUp: (email: string, password: string, fullName: string, companyName: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'Supabase is not configured'
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return error ? error.message : null
    } catch (e) {
      return errMsg(e)
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName: string, companyName: string) => {
    if (!supabase) return 'Supabase is not configured'
    try {
      // The database trigger handle_new_user() reads these two values and creates the company, profile and employee.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, company_name: companyName } },
      })
      if (error) return error.message
      return data.session ? null : 'confirm'
    } catch (e) {
      return errMsg(e)
    }
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
  }, [])

  return <Ctx.Provider value={{ remote: !!supabase, ready, session, signIn, signUp, signOut }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
