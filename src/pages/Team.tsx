import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { supabase } from '../lib/supabase'
import { errMsg } from '../lib/remote'

type Role = 'admin' | 'accounts' | 'sales' | 'dispatcher' | 'technician' | 'readonly'
const ROLES: { value: Role; label: string; note: string }[] = [
  { value: 'admin', label: 'Admin', note: 'Everything, including team and settings' },
  { value: 'accounts', label: 'Accounts', note: 'Can edit everything except team' },
  { value: 'sales', label: 'Sales', note: 'Can create and edit quotes, customers, leads' },
  { value: 'dispatcher', label: 'Dispatcher', note: 'Can schedule and edit jobs' },
  { value: 'technician', label: 'Technician', note: 'View only; completes their own jobs' },
  { value: 'readonly', label: 'Read only', note: 'View only' },
]

interface Member { id: string; name: string; email: string; role: Role }
interface Invite { id: string; email: string; role: Role; code: string; expires_at: string; used_at: string | null }

export default function Team() {
  const { remote, profile } = useStore()
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('technician')
  const [error, setError] = useState('')
  const [fresh, setFresh] = useState('') // link just created
  const [copied, setCopied] = useState(false)

  const link = (code: string) => `${window.location.origin}/?invite=${code}`

  const load = useCallback(async () => {
    if (!supabase) return
    try {
      const t = await supabase.rpc('list_team')
      if (t.error) throw new Error(t.error.message)
      setMembers(t.data as Member[])
      const i = await supabase.from('invites').select('id,email,role,code,expires_at,used_at').is('used_at', null).order('created_at', { ascending: false })
      if (i.error) throw new Error(i.error.message)
      setInvites(i.data as Invite[])
    } catch (e) {
      setError(errMsg(e))
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (remote && profile?.role === 'admin') void load()
  }, [remote, profile?.role, load])

  if (!remote) return <p className="muted">Team management needs the Supabase connection. This copy is running on local demo data.</p>
  if (profile?.role !== 'admin') return <p className="muted">Only admins can manage the team.</p>

  const changeRole = async (m: Member, next: Role) => {
    if (!supabase) return
    setError('')
    const { error: e } = await supabase.rpc('set_member_role', { p_id: m.id, p_role: next })
    if (e) setError(e.message)
    await load()
  }

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setError('')
    const addr = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return setError('Enter a valid email address.')
    if (members.some((m) => m.email.toLowerCase() === addr)) return setError('That person is already on your team.')
    const { data, error: er } = await supabase.from('invites').insert({ email: addr, role }).select('code').single()
    if (er) return setError(er.message)
    setFresh(link(data.code as string))
    setCopied(false)
    setEmail('')
    await load()
  }

  const revoke = async (id: string) => {
    if (!supabase || !confirm('Cancel this invitation?')) return
    const { error: er } = await supabase.from('invites').delete().eq('id', id)
    if (er) setError(er.message)
    await load()
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setError('Could not copy. Select the link and copy it by hand.')
    }
  }

  return (
    <div className="narrow" style={{ maxWidth: 760 }}>
      <div className="card">
        <h3>Team ({members.length})</h3>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.email}</td>
                <td>
                  <select value={m.role} onChange={(e) => void changeRole(m, e.target.value as Role)}>
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">{ROLES.map((r) => `${r.label}: ${r.note}`).join(' · ')}</p>
      </div>

      <div className="card">
        <h3>Invite someone</h3>
        <form className="row wrap" onSubmit={invite}>
          <input type="email" required placeholder="their@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button className="primary">Create invite link</button>
        </form>
        {fresh && (
          <div className="doc-pay" style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>
            <p style={{ margin: '0 0 6px' }}>Send this link to them. They must sign up using the same email address.</p>
            <input readOnly value={fresh} style={{ width: '100%' }} onFocus={(e) => e.currentTarget.select()} />
            <button style={{ marginTop: 6 }} onClick={() => void copy(fresh)}>{copied ? 'Copied' : 'Copy link'}</button>
          </div>
        )}
        {invites.length > 0 && (
          <>
            <h4 style={{ marginBottom: 4 }}>Pending invites</h4>
            <ul className="plain">
              {invites.map((i) => (
                <li key={i.id} className="row between">
                  <span>{i.email} <span className="muted">as {ROLES.find((r) => r.value === i.role)?.label}, expires {new Date(i.expires_at).toLocaleDateString('en-AU')}</span></span>
                  <span className="row">
                    <button onClick={() => void copy(link(i.code))}>Copy link</button>
                    <button onClick={() => void revoke(i.id)}>Cancel</button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
