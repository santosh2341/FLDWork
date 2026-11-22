import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { addDays, DAY_NAMES, fmtDate, hoursBetween, minutes, parseDate, today, weekStart } from '../lib/dates'
import type { Db, ScheduleEntry } from '../types'

const addMonths = (s: string, n: number) => {
  const d = parseDate(s)
  d.setMonth(d.getMonth() + n, 1)
  return fmtDate(d)
}
const byTime = (a: ScheduleEntry, b: ScheduleEntry) => minutes(a.start) - minutes(b.start)
const jobInfo = (db: Db, id: number) => {
  const j = db.jobs.find((x) => x.id === id)
  return {
    name: j ? `${j.id} – ${j.name}` : `Job ${id}`,
    customer: db.customers.find((c) => c.id === j?.customerId),
    site: db.sites.find((s) => s.id === j?.siteId),
  }
}

function DateNav({ date, setDate, unit }: { date: string; setDate: (d: string) => void; unit: 'day' | 'week' | 'month' }) {
  const step = (n: number) => setDate(unit === 'day' ? addDays(date, n) : unit === 'week' ? addDays(date, 7 * n) : addMonths(date, n))
  return (
    <div className="row no-print" style={{ marginBottom: 12 }}>
      <button onClick={() => step(-1)}>‹ Prev</button>
      <button onClick={() => setDate(today())}>Today</button>
      <button onClick={() => step(1)}>Next ›</button>
      <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
    </div>
  )
}

export function DayView() {
  const { db } = useStore()
  const [date, setDate] = useState(today())
  const entries = db.schedule.filter((e) => e.date === date)
  const waiting = db.jobs.filter((j) => j.status === 'pending')
  return (
    <>
      <h1>Day view</h1>
      <DateNav date={date} setDate={setDate} unit="day" />
      <p className="muted">{parseDate(date).toDateString()} · {entries.length} scheduled</p>
      <div className="grid2">
        {db.employees.map((emp) => {
          const mine = entries.filter((e) => e.employeeId === emp.id).sort(byTime)
          const hours = mine.reduce((a, e) => a + hoursBetween(e.start, e.end), 0)
          return (
            <div className="card" key={emp.id}>
              <div className="row between"><h3>{emp.name}</h3><span className="pill">{hours} hrs</span></div>
              {mine.length === 0 && <p className="muted">Nothing scheduled.</p>}
              <ul className="plain">
                {mine.map((e) => {
                  const info = jobInfo(db, e.jobId)
                  return (
                    <li key={e.id}>
                      <b>{e.start}–{e.end}</b> {info.name}
                      <br /><span className="muted">{info.customer?.name} · {info.site?.address}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
      <div className="card">
        <div className="row between"><h3>Waiting to be scheduled ({waiting.length})</h3><Link to="/schedules/timesheets">Schedule in Timesheets</Link></div>
        <ul className="plain">
          {waiting.map((j) => <li key={j.id}>{j.id} – {j.name}</li>)}
          {waiting.length === 0 && <li className="muted">All jobs are scheduled.</li>}
        </ul>
      </div>
    </>
  )
}

export function WeekView() {
  const { db } = useStore()
  const [date, setDate] = useState(weekStart(today()))
  const start = weekStart(date)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <>
      <h1>Week view</h1>
      <DateNav date={start} setDate={(d) => setDate(weekStart(d))} unit="week" />
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            {days.map((d, i) => <th key={d} style={d === today() ? { color: 'var(--brand)' } : undefined}>{DAY_NAMES[i]} {parseDate(d).getDate()}</th>)}
          </tr>
        </thead>
        <tbody>
          {db.employees.map((emp) => (
            <tr key={emp.id}>
              <td><b>{emp.name}</b></td>
              {days.map((d) => {
                const mine = db.schedule.filter((e) => e.employeeId === emp.id && e.date === d).sort(byTime)
                return (
                  <td key={d} style={{ verticalAlign: 'top', fontSize: '.8rem' }}>
                    {mine.map((e) => <div key={e.id}><b>{e.start}</b> {jobInfo(db, e.jobId).name}</div>)}
                  </td>
                )
              })}
            </tr>
          ))}
          {db.employees.length === 0 && <tr><td colSpan={8} className="muted">No employees.</td></tr>}
        </tbody>
      </table>
    </>
  )
}

export function MonthView() {
  const { db } = useStore()
  const [date, setDate] = useState(addDays(today(), -(parseDate(today()).getDate() - 1)))
  const first = date.slice(0, 7) + '-01'
  const gridStart = weekStart(first)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const month = parseDate(first)
  return (
    <>
      <h1>Month view</h1>
      <DateNav date={first} setDate={(d) => setDate(d.slice(0, 7) + '-01')} unit="month" />
      <p className="muted">{month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        {DAY_NAMES.map((n) => <div key={n} style={{ background: '#fafbfc', padding: 6, fontWeight: 600, fontSize: '.8rem' }}>{n}</div>)}
        {cells.map((d) => {
          const es = db.schedule.filter((e) => e.date === d).sort(byTime)
          const inMonth = d.slice(0, 7) === first.slice(0, 7)
          return (
            <div key={d} style={{ background: d === today() ? '#e6f2f2' : '#fff', minHeight: 84, padding: 4, opacity: inMonth ? 1 : 0.45, fontSize: '.75rem' }}>
              <b>{parseDate(d).getDate()}</b>
              {es.slice(0, 3).map((e) => <div key={e.id}>{e.start} {jobInfo(db, e.jobId).name}</div>)}
              {es.length > 3 && <div className="muted">+{es.length - 3} more</div>}
            </div>
          )
        })}
      </div>
    </>
  )
}

export function RunSheets() {
  const { db } = useStore()
  const [date, setDate] = useState(today())
  const [employeeId, setEmployeeId] = useState(db.employees[0]?.id ?? '')
  const emp = db.employees.find((e) => e.id === employeeId)
  const mine = db.schedule.filter((e) => e.employeeId === employeeId && e.date === date).sort(byTime)
  return (
    <>
      <h1>Run sheet</h1>
      <div className="row wrap no-print" style={{ marginBottom: 12 }}>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          {db.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button onClick={() => setDate(addDays(date, -1))}>‹</button>
        <button onClick={() => setDate(addDays(date, 1))}>›</button>
        <button className="primary" onClick={() => window.print()} disabled={mine.length === 0}>Print</button>
      </div>
      <h3>{emp?.name ?? 'No employee'} · {parseDate(date).toDateString()}</h3>
      {mine.length === 0 ? (
        <p className="muted">Nothing scheduled for this person on this day.</p>
      ) : (
        <table>
          <thead><tr><th>Done</th><th>Time</th><th>Job</th><th>Customer</th><th>Phone</th><th>Site</th></tr></thead>
          <tbody>
            {mine.map((e) => {
              const info = jobInfo(db, e.jobId)
              return (
                <tr key={e.id}>
                  <td><input type="checkbox" aria-label={`Mark ${info.name} done`} /></td>
                  <td>{e.start}–{e.end}</td>
                  <td>{info.name}</td>
                  <td>{info.customer?.name}</td>
                  <td>{info.customer?.phone}</td>
                  <td>{info.site?.address}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {mine.length > 0 && <p className="muted">Total scheduled: {mine.reduce((a, e) => a + hoursBetween(e.start, e.end), 0)} hrs</p>}
    </>
  )
}
