import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { today } from '../lib/dates'
import { FREQ_LABEL } from '../lib/recurring'
import type { RecurringJob } from '../types'

export default function Recurring() {
  const { db, addRecurring, updateRecurring, runRecurring } = useStore()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', quoteId: '', frequency: 'monthly' as RecurringJob['frequency'], nextDue: today() })
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const quoteLabel = (id: number) => {
    const q = db.quotes.find((x) => x.id === id)
    return q ? `#${q.id} ${q.name}` : `Quote ${id} (missing)`
  }
  const customerOf = (id: number) => {
    const q = db.quotes.find((x) => x.id === id)
    return db.customers.find((c) => c.id === q?.customerId)?.name ?? ''
  }
  const isDue = (r: RecurringJob) => r.active && r.nextDue <= today()
  const due = db.recurring.filter(isDue)

  const save = () => {
    if (!form.name.trim()) return setError('Give the schedule a name.')
    if (!form.quoteId) return setError('Choose the quote to copy for each job.')
    addRecurring({ name: form.name.trim(), quoteId: Number(form.quoteId), frequency: form.frequency, nextDue: form.nextDue, active: true })
    setForm({ ...form, name: '' })
    setError('')
    setAdding(false)
  }

  const run = async (ids: string[]) => {
    const n = await runRecurring(ids)
    setMsg(n === 0 ? 'Nothing was created. Check the schedule is active and its quote still exists.' : `Created ${n} pending job${n > 1 ? 's' : ''}. Find them under Jobs.`)
  }

  return (
    <>
      <div className="row between">
        <h1>Recurring jobs ({db.recurring.length})</h1>
        <div className="row">
          <button disabled={due.length === 0} onClick={() => run(due.map((r) => r.id))}>Create all due jobs ({due.length})</button>
          <button className="primary" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ New schedule'}</button>
        </div>
      </div>
      <p className="muted">Each schedule copies an existing quote into a new pending job every time it falls due. Jobs are created when you run it, not automatically in the background.</p>
      {msg && <p>{msg} <Link to="/jobs">Open jobs</Link></p>}

      {adding && (
        <div className="card">
          <div className="row wrap">
            <input className="grow" placeholder="Schedule name (e.g. Quarterly fire panel service) *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select value={form.quoteId} onChange={(e) => setForm({ ...form, quoteId: e.target.value })}>
              <option value="">Quote to copy…</option>
              {db.quotes.map((q) => <option key={q.id} value={q.id}>{quoteLabel(q.id)}</option>)}
            </select>
            <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as RecurringJob['frequency'] })}>
              {(Object.keys(FREQ_LABEL) as RecurringJob['frequency'][]).map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
            </select>
            <label>First due <input type="date" value={form.nextDue} onChange={(e) => e.target.value && setForm({ ...form, nextDue: e.target.value })} /></label>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="row" style={{ marginTop: 8 }}><button className="primary" onClick={save}>Save schedule</button></div>
        </div>
      )}

      <table>
        <thead><tr><th>Schedule</th><th>Customer</th><th>Template quote</th><th>Repeats</th><th>Next due</th><th>Last created</th><th>Active</th><th /></tr></thead>
        <tbody>
          {db.recurring.map((r) => (
            <tr key={r.id}>
              <td><b>{r.name}</b></td>
              <td>{customerOf(r.quoteId)}</td>
              <td><Link to={`/quotes/${r.quoteId}`}>{quoteLabel(r.quoteId)}</Link></td>
              <td>{FREQ_LABEL[r.frequency]}</td>
              <td>{r.nextDue} {isDue(r) && <span className="badge">Due</span>}</td>
              <td>{r.lastCreated ?? '–'}</td>
              <td><input type="checkbox" checked={r.active} aria-label={`Activate ${r.name}`} onChange={(e) => updateRecurring({ ...r, active: e.target.checked })} /></td>
              <td><button disabled={!r.active} onClick={() => run([r.id])}>Create job now</button></td>
            </tr>
          ))}
          {db.recurring.length === 0 && <tr><td colSpan={8} className="muted">No recurring schedules yet.</td></tr>}
        </tbody>
      </table>
    </>
  )
}
