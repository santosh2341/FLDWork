import { useState } from 'react'
import { useStore } from '../store'
import { money } from '../lib/costing'
import { isActive } from '../lib/people'
import type { Employee } from '../types'

// Settings → Employees: the people who do the work. Add someone who never signs in (a subcontractor), rename,
// mark as inactive (kept on past work, hidden from pickers), and set each person's hourly cost for job costing.
// Office roles manage the list; only admin and accounts change hourly costs (the database enforces both).
export default function EmployeeRates() {
  const { db, remote, profile, canWrite, setEmployeeRate, addEmployee, updateEmployee } = useStore()
  const canEditRates = remote ? profile?.role === 'admin' || profile?.role === 'accounts' : canWrite
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  if (!canWrite) return <p className="muted">Only office staff can manage employees.</p>

  const people = db.employees.filter((e) => showInactive || isActive(e))
  const inactiveCount = db.employees.filter((e) => !isActive(e)).length
  const add = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setBusy(true); setMsg(null)
    const r = await addEmployee(name)
    setBusy(false)
    if (r.error) return setMsg({ ok: false, text: r.error })
    setMsg({ ok: true, text: `Added ${name.trim()}.` })
    setName('')
  }

  return (
    <div className="card narrow" style={{ maxWidth: 820 }}>
      <h3>Employees</h3>
      <p className="muted">
        Everyone who can be scheduled. People who sign in appear here automatically; add others (for example a subcontractor) by name.
        Mark someone inactive when they leave: their past work keeps their name, but they no longer show up when booking new work.
      </p>
      <form className="row wrap" onSubmit={(e) => void add(e)} style={{ marginBottom: 10 }}>
        <input value={name} onChange={(e) => { setName(e.target.value); setMsg(null) }} placeholder="Full name" aria-label="New employee name" />
        <button className="primary" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add employee'}</button>
        {inactiveCount > 0 && <label><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show {inactiveCount} inactive</label>}
      </form>
      {msg && <p className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <p className="muted" style={{ marginTop: 0 }}>
        Hourly cost is what an hour of each person costs the business, ex GST (wages plus super, leave, workers comp and vehicle). Job costing multiplies clocked hours by it; anyone without one is costed at the quote's average labour cost.
        {!canEditRates && ' Only admin and accounts can change hourly costs.'}
      </p>
      <table className="keep-table">
        <thead><tr><th>Employee</th><th>Status</th><th className="num">Hourly cost</th><th /></tr></thead>
        <tbody>
          {people.map((e) => <Row key={e.id} e={e} canEditRates={canEditRates} saveRate={setEmployeeRate} update={updateEmployee} />)}
          {people.length === 0 && <tr><td colSpan={4} className="muted">No employees yet. Add one above.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function Row({ e, canEditRates, saveRate, update }: {
  e: Employee
  canEditRates: boolean
  saveRate: (id: string, rate: number | null) => Promise<string | null>
  update: (id: string, patch: { name?: string; active?: boolean }) => Promise<string | null>
}) {
  const [name, setName] = useState(e.name)
  const [rate, setRate] = useState(e.costRate == null ? '' : String(e.costRate))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const active = isActive(e)
  const nameDirty = name.trim() !== e.name
  const rateDirty = rate.trim() !== (e.costRate == null ? '' : String(e.costRate))

  const save = async () => {
    const t = rate.trim()
    const r = t === '' ? null : Number(t)
    if (!name.trim()) return setMsg({ ok: false, text: 'Enter a name.' })
    if (r != null && !(r >= 0 && r < 1000)) return setMsg({ ok: false, text: 'Enter an hourly cost between 0 and 999, or leave it blank.' })
    setBusy(true)
    let err: string | null = null
    if (nameDirty) err = await update(e.id, { name })
    if (!err && rateDirty && canEditRates) err = await saveRate(e.id, r == null ? null : Math.round(r * 100) / 100)
    setBusy(false)
    setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Saved' })
  }
  const toggle = async () => {
    setBusy(true)
    const err = await update(e.id, { active: !active })
    setBusy(false)
    setMsg(err ? { ok: false, text: err } : null)
  }

  return (
    <tr className={active ? '' : 'emp-inactive'}>
      <td><input value={name} aria-label={`Name for ${e.name}`} onChange={(ev) => { setName(ev.target.value); setMsg(null) }} onKeyDown={(ev) => { if (ev.key === 'Enter' && (nameDirty || rateDirty)) void save() }} /></td>
      <td>
        <span className={`pill ${active ? '' : 'muted'}`}>{active ? 'Active' : 'Inactive'}</span>{' '}
        <button className="link-btn" disabled={busy} onClick={() => void toggle()}>{active ? 'Mark inactive' : 'Make active'}</button>
      </td>
      <td className="num">
        {canEditRates ? (
          <input type="number" min={0} step="0.01" inputMode="decimal" aria-label={`Hourly cost for ${e.name}`} placeholder="Not set" style={{ maxWidth: 120 }}
            value={rate} onChange={(ev) => { setRate(ev.target.value); setMsg(null) }} onKeyDown={(ev) => { if (ev.key === 'Enter' && (nameDirty || rateDirty)) void save() }} />
        ) : e.costRate == null ? <span className="muted">Not set</span> : `${money(e.costRate)}/h`}
      </td>
      <td>
        <button disabled={busy || !(nameDirty || (rateDirty && canEditRates))} onClick={() => void save()}>Save</button>
        {msg && <span className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'} style={{ marginLeft: 8 }}>{msg.text}</span>}
      </td>
    </tr>
  )
}
