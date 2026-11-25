import { useState } from 'react'
import { useStore } from '../store'
import { money } from '../lib/costing'
import type { Employee } from '../types'

// Settings → Employees: what an hour of each person costs the business. Job costing uses it for actual labour.
// Office roles can see the rates; only admin and accounts can change them (the database enforces both).
export default function EmployeeRates() {
  const { db, remote, profile, canWrite, setEmployeeRate } = useStore()
  const canEdit = remote ? profile?.role === 'admin' || profile?.role === 'accounts' : canWrite
  if (!canWrite) return <p className="muted">Hourly costs are only visible to office staff.</p>
  return (
    <div className="card narrow" style={{ maxWidth: 760 }}>
      <h3>Hourly cost per employee</h3>
      <p className="muted">
        What an hour of each person costs the business, ex GST: wages plus on-costs such as super, leave, workers comp and the vehicle.
        Job costing multiplies each person's clocked hours by their own cost. Anyone without one is costed at the quote's average labour cost.
        {!canEdit && ' Only admin and accounts can change these.'}
      </p>
      <table className="keep-table">
        <thead><tr><th>Employee</th><th className="num">Hourly cost</th><th /></tr></thead>
        <tbody>
          {db.employees.map((e) => <RateRow key={e.id} e={e} canEdit={canEdit} save={setEmployeeRate} />)}
          {db.employees.length === 0 && <tr><td colSpan={3} className="muted">No employees yet. People appear here when they join the team.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function RateRow({ e, canEdit, save }: { e: Employee; canEdit: boolean; save: (id: string, rate: number | null) => Promise<string | null> }) {
  const [value, setValue] = useState(e.costRate == null ? '' : String(e.costRate))
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const current = e.costRate == null ? '' : String(e.costRate)
  const dirty = value.trim() !== current
  const submit = async () => {
    const t = value.trim()
    const rate = t === '' ? null : Number(t)
    if (rate != null && !(rate >= 0 && rate < 1000)) return setMsg({ text: 'Enter an hourly cost between 0 and 999, or leave it blank.', bad: true })
    setBusy(true)
    const err = await save(e.id, rate == null ? null : Math.round(rate * 100) / 100)
    setBusy(false)
    setMsg(err ? { text: err, bad: true } : { text: 'Saved', bad: false })
  }
  return (
    <tr>
      <td>{e.name}</td>
      <td className="num">
        {canEdit ? (
          <input type="number" min={0} step="0.01" inputMode="decimal" aria-label={`Hourly cost for ${e.name}`} placeholder="Not set" style={{ maxWidth: 120 }}
            value={value} onChange={(ev) => { setValue(ev.target.value); setMsg(null) }} onKeyDown={(ev) => { if (ev.key === 'Enter' && dirty) void submit() }} />
        ) : e.costRate == null ? <span className="muted">Not set</span> : `${money(e.costRate)}/h`}
      </td>
      <td>
        {canEdit && <button disabled={!dirty || busy} onClick={() => void submit()}>Save</button>}
        {msg && <span className={msg.bad ? 'error' : 'muted'} role={msg.bad ? 'alert' : 'status'} style={{ marginLeft: 8 }}>{msg.text}</span>}
      </td>
    </tr>
  )
}
