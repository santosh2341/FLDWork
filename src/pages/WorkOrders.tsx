import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { usePaged } from '../components/Paged'
import { hoursBetween, minutes, parseDate, today } from '../lib/dates'

export function WorkOrders() {
  const { db } = useStore()
  const [employeeId, setEmployeeId] = useState('all')
  const [past, setPast] = useState(false)
  const rows = db.schedule
    .filter((e) => (past ? true : e.date >= today()))
    .filter((e) => employeeId === 'all' || e.employeeId === employeeId)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
  const { shown, more } = usePaged(rows, `${employeeId}|${past}`)
  return (
    <>
      <h1>Work orders ({rows.length})</h1>
      <p className="muted">One work order per scheduled visit. Open one to print it for the technician.</p>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="all">All employees</option>
          {db.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <label><input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} /> Include past visits</label>
      </div>
      <table>
        <thead><tr><th>WO</th><th>Date</th><th>Time</th><th>Job</th><th>Customer</th><th>Technician</th></tr></thead>
        <tbody>
          {shown.map((e) => {
            const j = db.jobs.find((x) => x.id === e.jobId)
            return (
              <tr key={e.id}>
                <td><Link to={`/schedules/work-orders/${e.id}`}>WO-{e.id.toUpperCase()}</Link></td>
                <td>{e.date}</td><td>{e.start}–{e.end}</td>
                <td>{j ? `${j.id} – ${j.name}` : e.jobId}</td>
                <td>{db.customers.find((c) => c.id === j?.customerId)?.name}</td>
                <td>{db.employees.find((x) => x.id === e.employeeId)?.name}</td>
              </tr>
            )
          })}
          {rows.length === 0 && <tr><td colSpan={6} className="muted">No visits to show. Schedule a job in Timesheets first.</td></tr>}
        </tbody>
      </table>
      {more}
    </>
  )
}

export function WorkOrderDetail() {
  const { id } = useParams()
  const { db, openTab } = useStore()
  const e = db.schedule.find((x) => x.id === id)
  useEffect(() => {
    if (e) openTab({ path: `/schedules/work-orders/${e.id}`, title: `WO-${e.id.toUpperCase()}` })
  }, [e?.id, openTab]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!e) return <p>Work order not found.</p>
  const job = db.jobs.find((x) => x.id === e.jobId)
  const quote = db.quotes.find((x) => x.id === job?.quoteId)
  const customer = db.customers.find((c) => c.id === job?.customerId)
  const site = db.sites.find((s) => s.id === job?.siteId)
  const tech = db.employees.find((x) => x.id === e.employeeId)
  const items = quote?.costCenters.flatMap((cc) => cc.items.map((i) => ({ ...i, area: cc.name }))) ?? []
  const parts = items.filter((i) => i.kind === 'part')
  const labour = items.filter((i) => i.kind === 'labour')
  const visitHours = hoursBetween(e.start, e.end)
  const ok = minutes(e.end) > minutes(e.start)

  return (
    <>
      <div className="row between no-print">
        <h1>Work order WO-{e.id.toUpperCase()}</h1>
        <button className="primary" onClick={() => window.print()}>Print</button>
      </div>
      <div className="strip">
        <div><small>Date</small><br />{parseDate(e.date).toDateString()}</div>
        <div><small>Time</small><br />{e.start}–{e.end}{ok ? ` (${visitHours} hrs)` : ''}</div>
        <div><small>Technician</small><br />{tech?.name}</div>
        <div><small>Job</small><br />{job ? `${job.id} – ${job.name}` : e.jobId}</div>
      </div>
      <div className="grid2">
        <div className="card"><h3>Customer</h3><p>{customer?.name}<br />{customer?.contactName}<br />{customer?.phone}</p></div>
        <div className="card"><h3>Site</h3><p>{site?.name}<br />{site?.address}</p>{site?.accessNotes && <p><b>Access:</b> {site.accessNotes}</p>}</div>
      </div>
      <div className="card">
        <h3>Scope of work</h3>
        <p>{quote?.description || <span className="muted">No description on the quote.</span>}</p>
      </div>
      <h3>Parts to take</h3>
      <table>
        <thead><tr><th>Packed</th><th>Area</th><th>Part</th><th className="num">Qty</th></tr></thead>
        <tbody>
          {parts.map((p) => <tr key={p.id}><td><input type="checkbox" aria-label={`Packed ${p.description}`} /></td><td>{p.area}</td><td>{p.description}</td><td className="num">{p.quantity}</td></tr>)}
          {parts.length === 0 && <tr><td colSpan={4} className="muted">No parts on the quote.</td></tr>}
        </tbody>
      </table>
      <h3 style={{ marginTop: 16 }}>Allowed labour</h3>
      <table>
        <thead><tr><th>Role</th><th className="num">Quoted hours</th></tr></thead>
        <tbody>
          {labour.map((l) => <tr key={l.id}><td>{l.description}</td><td className="num">{l.quantity}</td></tr>)}
          {labour.length === 0 && <tr><td colSpan={2} className="muted">No labour on the quote.</td></tr>}
        </tbody>
      </table>
      <div className="grid2" style={{ marginTop: 24 }}>
        <div className="card"><h3>Work completed / notes</h3><div style={{ height: 90 }} /></div>
        <div className="card"><h3>Customer signature</h3><div style={{ height: 90 }} /><p className="muted">Name and date</p></div>
      </div>
    </>
  )
}
