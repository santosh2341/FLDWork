import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { addDays, DAY_NAMES, hoursBetween, layoutLanes, minutes, parseDate, today, weekStart } from '../lib/dates'
import type { ScheduleEntry } from '../types'

type View = 'calendar' | 'summary' | 'breakdown'

const FIRST_HOUR = 5
const LAST_HOUR = 22
const PX_PER_MIN = 0.8
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i)
const label = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`

export default function Timesheets() {
  const { db, addScheduleEntry, deleteScheduleEntry, setTimesheetLock, createJobFromQuote, canWrite } = useStore()
  const [from, setFrom] = useState(weekStart(today()))
  const [employeeId, setEmployeeId] = useState('all')
  const [view, setView] = useState<View>('calendar')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ jobId: '', employeeId: db.employees[0]?.id ?? '', date: today(), start: '08:00', end: '10:00' })

  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const people = db.employees.filter((e) => employeeId === 'all' || e.id === employeeId)
  const weekEntries = db.schedule.filter((e) => e.date >= days[0] && e.date <= days[6])
  const schedulableJobs = db.jobs.filter((j) => j.status !== 'invoiced')
  const approvedNoJob = db.quotes.filter((q) => q.status === 'approved' && !db.jobs.some((j) => j.quoteId === q.id))
  const jobName = (id: number) => db.jobs.find((j) => j.id === id)?.name ?? `Job ${id}`
  const jobCustomer = (id: number) => {
    const j = db.jobs.find((x) => x.id === id)
    return db.customers.find((c) => c.id === j?.customerId)?.name ?? ''
  }

  const lock = db.timesheetLock
  const isLocked = (date: string) => lock.on && !!lock.until && date <= lock.until

  const add = async () => {
    if (!form.jobId) return setError('Choose a job to schedule.')
    if (!form.employeeId) return setError('Choose an employee.')
    if (!form.date) return setError('Choose a date.')
    if (!(form.start < form.end)) return setError('End time must be after start time.')
    const msg = await addScheduleEntry({ ...form, jobId: Number(form.jobId) })
    setError(msg ?? '')
    if (!msg) {
      setFrom(weekStart(form.date)) // show the week the entry landed in
      setNotice(`Added to ${db.employees.find((e) => e.id === form.employeeId)?.name ?? 'employee'} on ${form.date}.`)
    }
  }
  const remove = async (e: ScheduleEntry) => {
    if (!confirm(`Remove ${jobName(e.jobId)} on ${e.date}?`)) return
    setError((await deleteScheduleEntry(e.id)) ?? '')
  }

  const summary = useMemo(
    () =>
      people.map((p) => {
        const byDay = days.map((d) =>
          weekEntries.filter((e) => e.employeeId === p.id && e.date === d).reduce((a, e) => a + hoursBetween(e.start, e.end), 0),
        )
        const clocked = db.clock
          .filter((c) => c.employeeId === p.id && c.end && c.start.slice(0, 10) >= days[0] && c.start.slice(0, 10) <= days[6])
          .reduce((a, c) => a + (new Date(c.end as string).getTime() - new Date(c.start).getTime()) / 3600000, 0)
        return { person: p, byDay, total: byDay.reduce((a, b) => a + b, 0), clocked }
      }),
    [people, days, weekEntries, db.clock],
  )

  return (
    <>
      <h1>Timesheets</h1>

      <div className="grid2">
        <div className="card">
          <h3>Filters</h3>
          <div className="row wrap">
            <label>Week starting <input type="date" value={from} onChange={(e) => e.target.value && setFrom(weekStart(e.target.value))} /></label>
            <button onClick={() => setFrom(addDays(from, -7))}>◀ Prev</button>
            <button onClick={() => setFrom(addDays(from, 7))}>Next ▶</button>
            <label>Employee
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="all">All employees</option>
                {db.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
          </div>
          <div className="row">
            {(['calendar', 'summary', 'breakdown'] as View[]).map((v) => (
              <label key={v}><input type="radio" checked={view === v} onChange={() => setView(v)} /> {v[0].toUpperCase() + v.slice(1)}</label>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Timesheet lock</h3>
          <div className="row">
            <label><input type="checkbox" checked={lock.on} onChange={(e) => setTimesheetLock(e.target.checked, lock.until)} /> Lock {lock.on ? 'ON' : 'OFF'}</label>
            <label>Lock until <input type="date" value={lock.until} onChange={(e) => setTimesheetLock(lock.on, e.target.value)} /></label>
          </div>
          <p className="muted">When on, entries on or before this date can't be added or removed.</p>
        </div>
      </div>

      <div className="card">
        <h3>Schedule a job</h3>
        <div className="row wrap">
          <select value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })}>
            <option value="">Job…</option>
            {schedulableJobs.map((j) => <option key={j.id} value={j.id}>{j.id} – {j.name}</option>)}
          </select>
          <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
            {db.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          <input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          <button className="primary" onClick={add} disabled={!canWrite}>Add</button>
        </div>
        {schedulableJobs.length === 0 && (
          <div>
            <p className="muted">There are no jobs to schedule yet. A job is created from an approved <Link to="/quotes">quote</Link>.</p>
            {approvedNoJob.length > 0 ? (
              <ul className="plain">
                {approvedNoJob.map((q) => (
                  <li key={q.id}>
                    Quote #{q.id} – {q.name}{' '}
                    {canWrite && <button onClick={async () => { await createJobFromQuote(q.id) }}>Create job</button>}
                  </li>
                ))}
              </ul>
            ) : (
              <div>
                <p className="muted">No approved quotes either. Open a quote and set its status to Approved (it saves automatically), then come back here.</p>
                <ul className="plain">
                  {db.quotes.filter((q) => q.status !== 'approved' && q.status !== 'declined' && !db.jobs.some((j) => j.quoteId === q.id)).map((q) => (
                    <li key={q.id}><Link to={`/quotes/${q.id}`}>Quote #{q.id} – {q.name}</Link> <span className="muted">needs approval</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {db.employees.length === 0 && <p className="error">No employees found. Add one in Settings first.</p>}
        {notice && !error && <p className="muted">{notice}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      {view === 'calendar' &&
        people.map((p) => (
          <div key={p.id} className="card">
            <h3>{p.name} <span className="muted">{days[0]} to {days[6]}</span></h3>
            <div className="scroll-x">
            <div className="cal">
              <div className="cal-axis">
                <div className="cal-head" />
                <div style={{ height: (LAST_HOUR - FIRST_HOUR) * 60 * PX_PER_MIN, position: 'relative' }}>
                  {HOURS.map((h) => (
                    <div key={h} className="cal-hour" style={{ top: (h - FIRST_HOUR) * 60 * PX_PER_MIN }}>{label(h)}</div>
                  ))}
                </div>
              </div>
              {days.map((d, i) => {
                const entries = weekEntries.filter((e) => e.employeeId === p.id && e.date === d)
                const { placed, lanes } = layoutLanes(entries)
                return (
                  <div key={d} className={`cal-col ${isLocked(d) ? 'locked' : ''}`}>
                    <div className="cal-head">{DAY_NAMES[i]} <span className="daynum">{parseDate(d).getDate()}</span></div>
                    <div className="cal-body" style={{ height: (LAST_HOUR - FIRST_HOUR) * 60 * PX_PER_MIN }}>
                      {HOURS.map((h) => <div key={h} className="cal-line" style={{ top: (h - FIRST_HOUR) * 60 * PX_PER_MIN }} />)}
                      {placed.map(({ item, lane }) => (
                        <div
                          key={item.id}
                          className="cal-event"
                          title={`${jobName(item.jobId)} – ${jobCustomer(item.jobId)}\n${item.start} to ${item.end}\nClick to remove`}
                          onClick={() => remove(item)}
                          style={{
                            top: Math.max(0, minutes(item.start) - FIRST_HOUR * 60) * PX_PER_MIN,
                            height: Math.max(20, (minutes(item.end) - minutes(item.start)) * PX_PER_MIN),
                            left: `${(lane / lanes) * 100}%`,
                            width: `${100 / lanes}%`,
                          }}
                        >
                          <b>Job {item.jobId}</b> {jobName(item.jobId)}
                          <br />{item.start}–{item.end} ({hoursBetween(item.start, item.end).toFixed(2)}h)
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            </div>
          </div>
        ))}

      {view === 'summary' && (
        <table>
          <thead>
            <tr><th>Employee</th>{days.map((d, i) => <th key={d} className="num">{DAY_NAMES[i]} {parseDate(d).getDate()}</th>)}<th className="num">Scheduled</th><th className="num" title="Time clocked on and off from My day">Clocked</th></tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.person.id}>
                <td>{s.person.name}</td>
                {s.byDay.map((h, i) => <td key={i} className="num">{h ? h.toFixed(2) : '–'}</td>)}
                <td className="num"><b>{s.total.toFixed(2)}</b></td>
                <td className="num">{s.clocked ? s.clocked.toFixed(2) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view === 'breakdown' && (
        <table>
          <thead><tr><th>Date</th><th>Employee</th><th>Job</th><th>Customer</th><th>Start</th><th>End</th><th className="num">Hours</th></tr></thead>
          <tbody>
            {weekEntries
              .filter((e) => employeeId === 'all' || e.employeeId === employeeId)
              .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
              .map((e) => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td>{db.employees.find((x) => x.id === e.employeeId)?.name}</td>
                  <td>{e.jobId} – {jobName(e.jobId)}</td>
                  <td>{jobCustomer(e.jobId)}</td>
                  <td>{e.start}</td><td>{e.end}</td>
                  <td className="num">{hoursBetween(e.start, e.end).toFixed(2)}</td>
                </tr>
              ))}
            {weekEntries.length === 0 && <tr><td colSpan={7} className="muted">No entries this week.</td></tr>}
          </tbody>
        </table>
      )}
    </>
  )
}
