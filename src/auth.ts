import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

// Sign-in state. AuthProvider (AuthProvider.tsx) fills this in.
export interface AuthCtx {
  remote: boolean // false = no Supabase env vars, app runs on local demo data
  ready: boolean // the first session check has finished
  session: Session | null
  signIn: (email: string, password: string) => Promise<string | null>
  // returns an error message, 'confirm' when an email must be confirmed first, or null when signed in
  signUp: (email: string, password: string, fullName: string, companyName: string, inviteCode?: string) => Promise<string | null>
  signOut: () => Promise<void>
  recovery: boolean // true while the person arrived from a password-reset email and must choose a new password
  linkError: string // set when an email link was expired or invalid
  resetPassword: (email: string) => Promise<string | null> // sends the reset email; returns an error message or null
  updatePassword: (password: string) => Promise<string | null> // saves the new password during recovery
  cancelRecovery: () => Promise<void>
}

export const AuthContext = createContext<AuthCtx | null>(null)

export function useAuth() {
  const c = useContext(AuthContext)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
