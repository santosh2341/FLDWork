import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import MapView from '../components/MapView'
import type { Pin } from '../components/MapView'
import { addDays, today } from '../lib/dates'
import { daysOverdue, isUnpaid } from '../lib/invoicing'
import Icon from '../components/Icon'
import type { IconName } from '../components/Icon'
import CountUp from '../components/CountUp'
import { shortAddress } from '../lib/address'

const ANNOUNCEMENTS = [
  { title: 'Welcome to Fieldwork', body: 'Quotes, jobs, scheduling, invoicing, inventory and reports are all live in this build.' },
  { title: 'Timesheet lock', body: 'Admins can freeze past timesheets from Schedules → Timesheets.' },
]

export default function Dashboard() {
  const { db, addReminder, toggleReminder, snoozeReminder, remote, seedDemoData, profile } = useStore()
  const [date, setDate] = useState(today())
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const [text, setText] = useState('')

  // tone: red only for things that cost money or need action now, amber for warnings, brand teal for everyday counts
  const alerts: { label: string; n: number; to: string; icon: IconName; tone: 'danger' | 'warn' | 'brand'; hint: string }[] = [
    { label: 'Customers on hold', n: db.customers.filter((c) => c.onHold).length, to: '/customers?filter=hold', icon: 'users', tone: 'warn', hint: 'Review' },
    { label: 'Overdue invoices', n: db.invoices.filter((i) => isUnpaid(i) && daysOverdue(i) > 0).length, to: '/invoices?filter=overdue', icon: 'receipt', tone: 'danger', hint: 'Chase up' },
    { label: 'Low stock parts', n: db.catalog.filter((p) => p.stock < 5).length, to: '/materials/inventory?filter=low', icon: 'box', tone: 'warn', hint: 'Reorder' },
    { label: 'Jobs to schedule', n: db.jobs.filter((j) => j.status === 'pending').length, to: '/jobs?filter=pending', icon: 'wrench', tone: 'brand', hint: 'Assign' },
    { label: 'Quotes to complete', n: db.quotes.filter((q) => q.status === 'to_be_completed').length, to: '/quotes?filter=to_be_completed', icon: 'quote', tone: 'brand', hint: 'Finish' },
  ]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = profile?.fullName?.split(' ')[0]
  const longDate = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  const reminders = db.reminders.filter((r) => !r.done && (!r.snoozedUntil || r.snoozedUntil <= today()))
  const dayEntries = db.schedule.filter((e) => e.date === date)

  const pins = useMemo<Pin[]>(() => {
    const out: Pin[] = []
    for (const e of dayEntries) {
      if (hidden[e.id]) continue
      const job = db.jobs.find((j) => j.id === e.jobId)
      const site = db.sites.find((s) => s.id === job?.siteId)
      if (!job || site?.lat == null || site.lng == null) continue
      out.push({
        id: e.id,
        lat: site.lat,
        lng: site.lng,
        title: `Job ${job.id} – ${job.name}`,
        detail: `${e.start}–${e.end}, ${site.address}${site.accessNotes ? ' · Access: ' + site.accessNotes : ''}`,
        href: '/jobs',
      })
    }
    return out
  }, [dayEntries, hidden, db.jobs, db.sites])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting}{first ? `, ${first}` : ''}</h1>
          <p className="muted">{longDate} · Service Dashboard</p>
        </div>
      </div>

      {remote && db.customers.length === 0 && db.quotes.length === 0 && (
        <div className="card">
          <h3>Your company is empty</h3>
          <p className="muted">Start adding customers and parts, or fill it with sample records to look around.</p>
          <button className="primary" onClick={() => void seedDemoData()}>Load demo data</button>
        </div>
      )}

      <div className="cards">
        {alerts.map((c) => (
          <Link key={c.label} to={c.to} className={`card alert tone-${c.tone} ${c.n === 0 ? 'zero' : ''}`}>
            <div className="alert-top">
              <span className="alert-icon"><Icon name={c.icon} size={18} /></span>
              <span className="alert-pill">{c.n === 0 ? 'All clear' : c.hint}</span>
            </div>
            <div className="big"><CountUp value={c.n} /></div>
            <div className="alert-label">{c.label}<Icon name="arrow" size={15} /></div>
          </Link>
        ))}
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Announcements</h3>
          <div className="scroll-list">
            {ANNOUNCEMENTS.map((a) => (
              <p key={a.title}><b>{a.title}</b><br /><span className="muted">{a.body}</span></p>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Reminders</h3>
          {reminders.length === 0 && <p className="muted">No reminders found.</p>}
          <div className="scroll-list">
            <ul className="plain">
              {reminders.map((r) => (
                <li key={r.id} className="row between">
                  <label><input type="checkbox" checked={r.done} onChange={() => toggleReminder(r.id)} /> {r.text}</label>
                  <button onClick={() => snoozeReminder(r.id, addDays(today(), 1))}>Snooze 1 day</button>
                </li>
              ))}
            </ul>
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { addReminder(text.trim()); setText('') } }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a reminder…" />
            <button>Add</button>
          </form>
        </div>
      </div>

      <div className="grid2">
        <div className="card fill">
          <h3>Map</h3>
          <MapView pins={pins} />
          {pins.length === 0 && <p className="muted">No visible jobs with a mapped site for this day.</p>}
        </div>
        <div className="card fill">
          <div className="row between">
            <h3>Schedule</h3>
            <div className="row">
              <button onClick={() => setDate(addDays(date, -1))}>PREV</button>
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              <button onClick={() => setDate(addDays(date, 1))}>NEXT</button>
            </div>
          </div>
          {dayEntries.length === 0 && <p className="muted">Nothing scheduled on this day.</p>}
          <div className="scroll-list grow">
          {db.employees.map((emp) => {
            const mine = dayEntries.filter((e) => e.employeeId === emp.id).sort((a, b) => a.start.localeCompare(b.start))
            if (mine.length === 0) return null
            return (
              <div key={emp.id}>
                <b className="sched-emp">{emp.name}</b>
                <table>
                  <thead><tr><th>Map</th><th>Job</th><th>Scheduled</th><th>Customer</th><th>Site</th></tr></thead>
                  <tbody>
                    {mine.map((e) => {
                      const job = db.jobs.find((j) => j.id === e.jobId)
                      const site = db.sites.find((s) => s.id === job?.siteId)
                      return (
                        <tr key={e.id}>
                          <td><input type="checkbox" checked={!hidden[e.id]} onChange={() => setHidden({ ...hidden, [e.id]: !hidden[e.id] })} /></td>
                          <td><Link to="/jobs">{job?.id} – {job?.name}</Link></td>
                          <td>{e.start}–{e.end}</td>
                          <td>{db.customers.find((c) => c.id === job?.customerId)?.name}</td>
                          <td title={site?.address}>{shortAddress(site?.address, site?.addressParts)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
          </div>
        </div>
      </div>
    </>
  )
}
