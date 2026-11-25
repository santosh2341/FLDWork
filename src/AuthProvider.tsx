import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { errMsg } from './lib/remote'
import { AuthContext } from './auth'

const fromUrl = () => (typeof window === 'undefined' ? '' : window.location.hash + window.location.search)


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

  const signUp = useCallback(async (email: string, password: string, fullName: string, companyName: string, inviteCode?: string) => {
    if (!supabase) return 'Supabase is not configured'
    try {
      // The database trigger handle_new_user() reads these two values and creates the company, profile and employee.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, company_name: companyName, ...(inviteCode ? { invite_code: inviteCode } : {}) } },
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

  return <AuthContext.Provider value={{ remote: !!supabase, ready, session, signIn, signUp, signOut, recovery, linkError, resetPassword, updatePassword, cancelRecovery }}>{children}</AuthContext.Provider>
}
