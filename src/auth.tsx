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
  recovery: boolean // true while the person arrived from a password-reset email and must choose a new password
  linkError: string // set when an email link was expired or invalid
  resetPassword: (email: string) => Promise<string | null> // sends the reset email; returns an error message or null
  updatePassword: (password: string) => Promise<string | null> // saves the new password during recovery
  cancelRecovery: () => Promise<void>
}

const fromUrl = () => (typeof window === 'undefined' ? '' : window.location.hash + window.location.search)

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  // The reset link opens the app with type=recovery in the URL. Check it up front so the event is not missed.
  const [recovery, setRecovery] = useState(() => /[#&?]type=recovery/.test(fromUrl()))
  const [linkError] = useState(() => {
    const m = /[#&?]error_description=([^&]+)/.exec(fromUrl())
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : ''
  })

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
    })
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

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return 'Supabase is not configured'
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      return error ? error.message : null
    } catch (e) {
      return errMsg(e)
    }
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) return 'Supabase is not configured'
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) return error.message
      window.history.replaceState(null, '', window.location.pathname)
      setRecovery(false)
      return null
    } catch (e) {
      return errMsg(e)
    }
  }, [])

  const cancelRecovery = useCallback(async () => {
    window.history.replaceState(null, '', window.location.pathname)
    setRecovery(false)
    if (supabase) await supabase.auth.signOut()
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
  }, [])

  return <Ctx.Provider value={{ remote: !!supabase, ready, session, signIn, signUp, signOut, recovery, linkError, resetPassword, updatePassword, cancelRecovery }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
