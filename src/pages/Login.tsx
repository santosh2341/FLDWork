import { useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth'
import Icon, { Logo } from '../components/Icon'

type Mode = 'in' | 'up' | 'forgot'

const POINTS = [
  'Quotes with live costing and margins',
  'Scheduling, timesheets and mobile audits',
  'Invoicing with ageing, payments and retainage',
  'Inventory, purchase orders and reports',
]

// Split layout: brand panel on the left (hidden on small screens), form on the right.
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-hero">
        <div className="auth-grid" />
        <div className="auth-brand"><Logo size={40} /> Fieldwork</div>
        <div className="auth-copy">
          <h2>Run every job, from first quote to final invoice.</h2>
          <p>One place for your office and your crews: quote, schedule, complete and get paid.</p>
          <ul className="auth-points">
            {POINTS.map((t) => (
              <li key={t}><span className="tick"><Icon name="check" size={14} /></span>{t}</li>
            ))}
          </ul>
        </div>
        <div className="auth-foot">Field service management</div>
      </aside>
      <div className="login-wrap">{children}</div>
    </div>
  )
}

export default function Login() {
  const { signIn, signUp, recovery, linkError, resetPassword, updatePassword, cancelRecovery } = useAuth()
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fullName, setFullName] = useState('')
  const [company, setCompany] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(linkError)
  const [isError, setIsError] = useState(!!linkError)

  const show = (text: string, error: boolean) => {
    setMsg(text)
    setIsError(error)
  }
  const switchMode = (m: Mode) => {
    setMode(m)
    setMsg('')
    setPassword('')
    setConfirm('')
  }

  // Shown after the person clicks the link in the reset email.
  if (recovery) {
    const save = async (e: React.FormEvent) => {
      e.preventDefault()
      if (password !== confirm) return show('The two passwords do not match.', true)
      setBusy(true)
      const err = await updatePassword(password)
      setBusy(false)
      if (err) show(err, true)
    }
    return (
      <AuthShell>
        <form className="login" onSubmit={save}>
          <h1>Fieldwork</h1>
          <p className="muted">Choose a new password</p>
          <label>New password<input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
          <label>Confirm new password<input required type="password" minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></label>
          <button className="primary" disabled={busy}>{busy ? 'Please wait…' : 'Save new password'}</button>
          {msg && <p className={isError ? 'error' : 'muted'}>{msg}</p>}
          <button type="button" className="link-btn" onClick={() => void cancelRecovery()}>Cancel</button>
        </form>
      </AuthShell>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    if (mode === 'forgot') {
      const err = await resetPassword(email.trim())
      setBusy(false)
      if (err) show(err, true)
      else show('If an account exists for that email, a reset link is on its way. It can take a few minutes. Check your spam folder too.', false)
      return
    }
    const r = mode === 'in' ? await signIn(email.trim(), password) : await signUp(email.trim(), password, fullName.trim(), company.trim())
    setBusy(false)
    if (r === 'confirm') {
      show('Account created. Check your email for a confirmation link, then sign in.', false)
      setMode('in')
    } else if (r) {
      show(r, true)
    }
  }

  return (
    <AuthShell>
      <form className="login" onSubmit={submit}>
        <h1>Fieldwork</h1>
        <p className="muted">
          {mode === 'in' ? 'Sign in to your company' : mode === 'up' ? 'Create your company account' : 'Enter your email and we will send you a link to reset your password'}
        </p>
        {mode === 'up' && (
          <>
            <label>Your name<input required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" /></label>
            <label>Company name<input required value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" /></label>
          </>
        )}
        <label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        {mode !== 'forgot' && (
          <label>Password<input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}
        </button>
        {msg && <p className={isError ? 'error' : 'muted'}>{msg}</p>}
        {mode === 'in' && (
          <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>Forgot your password?</button>
        )}
        {mode === 'forgot' ? (
          <button type="button" className="link-btn" onClick={() => switchMode('in')}>Back to sign in</button>
        ) : (
          <button type="button" className="link-btn" onClick={() => switchMode(mode === 'in' ? 'up' : 'in')}>
            {mode === 'in' ? 'New here? Create a company account' : 'Already have an account? Sign in'}
          </button>
        )}
      </form>
    </AuthShell>
  )
}
