import { useState } from 'react'
import { useAuth } from '../auth'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [company, setCompany] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const r = mode === 'in' ? await signIn(email.trim(), password) : await signUp(email.trim(), password, fullName.trim(), company.trim())
    setBusy(false)
    if (r === 'confirm') {
      setIsError(false)
      setMsg('Account created. Check your email for a confirmation link, then sign in.')
      setMode('in')
    } else if (r) {
      setIsError(true)
      setMsg(r)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <h1>Fieldwork</h1>
        <p className="muted">{mode === 'in' ? 'Sign in to your company' : 'Create your company account'}</p>
        {mode === 'up' && (
          <>
            <label>Your name<input required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" /></label>
            <label>Company name<input required value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" /></label>
          </>
        )}
        <label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label>Password<input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>
        <button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        {msg && <p className={isError ? 'error' : 'muted'}>{msg}</p>}
        <button type="button" className="link-btn" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg('') }}>
          {mode === 'in' ? 'New here? Create a company account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
