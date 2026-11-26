import { isActive, pickable } from '../lib/people'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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

// ---- moving visits: drag and drop with a mouse, or tap a visit / waiting job to open a "Move" sheet (phones, keyboards) ----
type Drag = { t: 'entry'; id: string } | { t: 'job'; id: number }
type Slot = { employeeId: string; date: string; start: string; end: string }
const DEFAULT_START = '09:00'
const DEFAULT_END = '11:00'

function useScheduler(db: Db, defaultDate: string) {
  const { canWrite, moveScheduleEntry, addScheduleEntry, deleteScheduleEntry, setJobStatus } = useStore()
  const [over, setOver] = useState('')
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null)
  const [sheet, setSheet] = useState<Drag | null>(null)

  // Book a waiting job or move a visit, then say where it went (and warn about an overlap).
  const place = async (d: Drag, to: Slot): Promise<string | null> => {
    const label = jobInfo(db, d.t === 'entry' ? db.schedule.find((x) => x.id === d.id)?.jobId ?? 0 : d.id).name
    const err = d.t === 'entry' ? await moveScheduleEntry(d.id, to) : await addScheduleEntry({ jobId: d.id, ...to })
    if (err) return err
    const clash = db.schedule.find((x) => x.employeeId === to.employeeId && x.date === to.date && (d.t !== 'entry' || x.id !== d.id) && minutes(x.start) < minutes(to.end) && minutes(to.start) < minutes(x.end))
    const who = db.employees.find((x) => x.id === to.employeeId)?.name
    setMsg({ text: `${label} is now with ${who} on ${parseDate(to.date).toDateString()} (${to.start}–${to.end}).${clash ? ` Heads up: this overlaps ${jobInfo(db, clash.jobId).name} (${clash.start}–${clash.end}).` : ''}`, bad: !!clash })
    return null
  }

  const open = (d: Drag) => () => setSheet(d)
  const dragProps = (d: Drag) => canWrite ? {
    draggable: true,
    onDragStart: (ev: React.DragEvent) => { ev.dataTransfer.setData('application/x-fieldwork', JSON.stringify(d)); ev.dataTransfer.effectAllowed = 'move' },
    onClick: open(d),
    onKeyDown: (ev: React.KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setSheet(d) } },
    role: 'button',
    tabIndex: 0,
    'aria-haspopup': 'dialog' as const,
    className: 'dnd-item',
  } : {}
  const zoneProps = (key: string, empId: string, date: string) => canWrite ? {
    onDragOver: (ev: React.DragEvent) => { ev.preventDefault(); if (over !== key) setOver(key) },
    onDragLeave: () => setOver((o) => (o === key ? '' : o)),
    onDrop: async (ev: React.DragEvent) => {
      ev.preventDefault(); setOver('')
      let d: Drag
      try { d = JSON.parse(ev.dataTransfer.getData('application/x-fieldwork')) } catch { return }
      let start = DEFAULT_START, end = DEFAULT_END
      if (d.t === 'entry') {
        const e = db.schedule.find((x) => x.id === d.id)
        if (!e || (e.employeeId === empId && e.date === date)) return
        start = e.start; end = e.end
      }
      const err = await place(d, { employeeId: empId, date, start, end })
      if (err) setMsg({ text: err, bad: true })
    },
    'data-over': over === key ? '1' : undefined,
  } : {}
  const note = msg && <div className={`dnd-msg ${msg.bad ? 'warn' : ''}`} role="status" onClick={() => setMsg(null)}>{msg.text}</div>
  const sheetEl = sheet && (
    <MoveSheet
      key={`${sheet.t}:${sheet.id}`}
      db={db}
      what={sheet}
      defaultDate={defaultDate}
      onCancel={() => setSheet(null)}
      onSave={async (to) => { const err = await place(sheet, to); if (!err) setSheet(null); return err }}
      onRemove={sheet.t === 'entry' ? async () => {
        const e = db.schedule.find((x) => x.id === sheet.id)
        const err = await deleteScheduleEntry(sheet.id)
        if (err) return err
        // last visit gone: put a scheduled job back on the waiting list instead of leaving it "scheduled" with nothing booked
        const job = e && db.jobs.find((j) => j.id === e.jobId)
        const backToWaiting = !!job && job.status === 'scheduled' && !db.schedule.some((x) => x.jobId === job.id && x.id !== e.id)
        if (job && backToWaiting) setJobStatus(job.id, 'pending')
        setSheet(null)
        setMsg({ text: `Removed ${e ? jobInfo(db, e.jobId).name : 'the visit'} from the schedule.${backToWaiting ? ' It is back on the waiting list.' : ''}`, bad: false })
        return null
      } : undefined}
    />
  )
  return { dragProps, zoneProps, note, sheet: sheetEl, open, canWrite, flash: (text: string) => setMsg({ text, bad: true }) }
}

// The tap-friendly way to schedule: pick person, day and times. Opens for a visit (move) or a waiting job (book).
function MoveSheet({ db, what, defaultDate, onSave, onCancel, onRemove }: {
  db: Db
  what: Drag
  defaultDate: string
  onSave: (to: Slot) => Promise<string | null>
  onCancel: () => void
  onRemove?: () => Promise<string | null>
}) {
  const entry = what.t === 'entry' ? db.schedule.find((x) => x.id === what.id) : undefined
  const jobId = entry ? entry.jobId : what.t === 'job' ? what.id : 0
  const info = jobInfo(db, jobId)
  const [f, setF] = useState<Slot>(() => entry
    ? { employeeId: entry.employeeId, date: entry.date, start: entry.start, end: entry.end }
    : { employeeId: pickable(db.employees)[0]?.id ?? '', date: defaultDate, start: DEFAULT_START, end: DEFAULT_END })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const set = (k: keyof Slot) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const unchanged = !!entry && entry.employeeId === f.employeeId && entry.date === f.date && entry.start === f.start && entry.end === f.end
  const save = async () => {
    if (!f.employeeId) return setErr('Choose who will do the work.')
    if (!f.date) return setErr('Choose a day.')
    if (!(f.start < f.end)) return setErr('End time must be after start time.')
    setBusy(true); setErr('')
    const e = await onSave(f)
    setBusy(false)
    if (e) setErr(e)
  }
  const remove = async () => {
    if (!onRemove) return
    setBusy(true)
    const e = await onRemove()
    setBusy(false)
    if (e) setErr(e)
  }
  if (what.t === 'entry' && !entry) return null
  return (
    <div className="modal-bg" onClick={onCancel}>
      <form className="modal move-sheet" role="dialog" aria-label={entry ? 'Move visit' : 'Book job'} onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void save() }}>
        <h3>{entry ? 'Move visit' : 'Book job'}</h3>
        <p className="muted" style={{ margin: 0 }}>{info.name}{info.customer ? ` · ${info.customer.name}` : ''}</p>
        <label>Who
          <select value={f.employeeId} onChange={set('employeeId')}>
            {pickable(db.employees, f.employeeId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label>Day<input type="date" value={f.date} onChange={set('date')} /></label>
        <div className="row move-times">
          <label>Start<input type="time" value={f.start} onChange={set('start')} /></label>
          <label>End<input type="time" value={f.end} onChange={set('end')} /></label>
        </div>
        {err && <p className="error" role="alert">{err}</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={busy || unchanged}>{entry ? 'Save changes' : 'Book it'}</button>
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
        {onRemove && (confirmRemove ? (
          <div className="row">
            <span>Remove this visit from the schedule?</span>
            <button type="button" disabled={busy} onClick={() => void remove()}>Remove</button>
            <button type="button" className="link-btn" onClick={() => setConfirmRemove(false)}>Keep</button>
          </div>
        ) : (
          <button type="button" className="link-btn" style={{ justifySelf: 'start' }} onClick={() => setConfirmRemove(true)}>Remove from schedule</button>
        ))}
      </form>
    </div>
  )
}

function WaitingJobs({ db, dragProps, canWrite, hint }: { db: Db; dragProps: (d: Drag) => object; canWrite: boolean; hint: string }) {
  const waiting = db.jobs.filter((j) => j.status === 'pending')
  return (
    <div className="card">
      <div className="row between"><h3>Waiting to be scheduled ({waiting.length})</h3><Link to="/schedules/timesheets">Schedule in Timesheets</Link></div>
      {canWrite && waiting.length > 0 && <p className="muted">{hint}</p>}
      <div className="dnd-chips">
        {waiting.map((j) => <span key={j.id} {...dragProps({ t: 'job', id: j.id })}>{j.id} – {j.name}</span>)}
        {waiting.length === 0 && <span className="muted">All jobs are scheduled.</span>}
      </div>
    </div>
  )
}

export function DayView() {
  const { db } = useStore()
  const [date, setDate] = useState(today())
  const sch = useScheduler(db, date)
  const entries = db.schedule.filter((e) => e.date === date)
  return (
    <>
      <h1>Day view</h1>
      <DateNav date={date} setDate={setDate} unit="day" />
      <p className="muted">{parseDate(date).toDateString()} · {entries.length} scheduled{sch.canWrite ? ' · tap a visit to move it or change its time, or drag it onto another person' : ''}</p>
      {sch.note}
      {sch.sheet}
      <div className="grid2">
        {db.employees.filter((emp) => isActive(emp) || entries.some((e) => e.employeeId === emp.id)).map((emp) => {
          const mine = entries.filter((e) => e.employeeId === emp.id).sort(byTime)
          const hours = mine.reduce((a, e) => a + hoursBetween(e.start, e.end), 0)
          return (
            <div className="card dnd-zone" key={emp.id} {...sch.zoneProps(`d:${emp.id}`, emp.id, date)}>
              <div className="row between"><h3>{emp.name}</h3><span className="pill">{hours} hrs</span></div>
              {mine.length === 0 && <p className="muted">Nothing scheduled.{sch.canWrite ? ' Book a waiting job below, or drop one here.' : ''}</p>}
              <ul className="plain">
                {mine.map((e) => {
                  const info = jobInfo(db, e.jobId)
                  return (
                    <li key={e.id} {...sch.dragProps({ t: 'entry', id: e.id })}>
                      <b>{e.start}–{e.end}</b> {info.name}
                      {sch.canWrite && <span className="link-btn move-hint" aria-hidden="true">Move / change time</span>}
                      <br /><span className="muted">{info.customer?.name} · {info.site?.address}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
      <WaitingJobs db={db} dragProps={sch.dragProps} canWrite={sch.canWrite} hint="Tap a job to book it, or drag it onto a person (09:00–11:00 to start with)." />
    </>
  )
}

export function WeekView() {
  const { db } = useStore()
  const [wk] = useSearchParams()
  const asked = wk.get('week') ?? ''
  const [date, setDate] = useState(() => weekStart(/^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today())) // ?week=YYYY-MM-DD opens that week
  const start = weekStart(date)
  const sch = useScheduler(db, start <= today() && today() <= addDays(start, 6) ? today() : start)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  // "Schedule" on the Jobs page links here with ?book=<job id>: open the booking sheet for that job once
  const [params, setParams] = useSearchParams()
  const bookId = Number(params.get('book')) || 0
  const bookJob = bookId ? db.jobs.find((j) => j.id === bookId) : undefined
  useEffect(() => {
    if (!bookJob) return
    if (bookJob.status === 'pending') sch.open({ t: 'job', id: bookJob.id })()
    else sch.flash(`${bookJob.id} – ${bookJob.name} is already ${db.settings.jobStatusLabels[bookJob.status]?.toLowerCase() ?? bookJob.status}. Tap its visit below to move it.`)
    const p = new URLSearchParams(params); p.delete('book'); setParams(p, { replace: true })
  }, [bookJob?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <h1>Week view</h1>
      <DateNav date={start} setDate={(d) => setDate(weekStart(d))} unit="week" />
      {sch.canWrite && <p className="muted">Tap a visit to move it or change its time, or drag it to another day or person. Tap a waiting job below to book it.</p>}
      {sch.note}
      {sch.sheet}
      <table className="keep-table sched-week">
        <thead>
          <tr>
            <th>Employee</th>
            {days.map((d, i) => <th key={d} style={d === today() ? { color: 'var(--brand)' } : undefined}>{DAY_NAMES[i]} {parseDate(d).getDate()}</th>)}
          </tr>
        </thead>
        <tbody>
          {db.employees.filter((emp) => isActive(emp) || db.schedule.some((e) => e.employeeId === emp.id && days.includes(e.date))).map((emp) => (
            <tr key={emp.id}>
              <td><b>{emp.name}</b></td>
              {days.map((d) => {
                const mine = db.schedule.filter((e) => e.employeeId === emp.id && e.date === d).sort(byTime)
                return (
                  <td key={d} className="dnd-zone" style={{ verticalAlign: 'top', fontSize: '.8rem' }} {...sch.zoneProps(`w:${emp.id}:${d}`, emp.id, d)}>
                    {mine.map((e) => <div key={e.id} {...sch.dragProps({ t: 'entry', id: e.id })}><b>{e.start}</b> {jobInfo(db, e.jobId).name}</div>)}
                  </td>
                )
              })}
            </tr>
          ))}
          {db.employees.length === 0 && <tr><td colSpan={8} className="muted">No employees.</td></tr>}
        </tbody>
      </table>
      <WaitingJobs db={db} dragProps={sch.dragProps} canWrite={sch.canWrite} hint="Tap a job to book it, or drag it into a person's day above." />
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
      <div className="scroll-x"><div className="month-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        {DAY_NAMES.map((n) => <div key={n} style={{ background: 'var(--surface-2)', padding: 6, fontWeight: 600, fontSize: '.8rem' }}>{n}</div>)}
        {cells.map((d) => {
          const es = db.schedule.filter((e) => e.date === d).sort(byTime)
          const inMonth = d.slice(0, 7) === first.slice(0, 7)
          return (
            <div key={d} style={{ background: d === today() ? 'var(--brand-soft)' : 'var(--panel)', minHeight: 84, padding: 4, opacity: inMonth ? 1 : 0.45, fontSize: '.75rem' }}>
              <b>{parseDate(d).getDate()}</b>
              {es.slice(0, 3).map((e) => <div key={e.id}>{e.start} {jobInfo(db, e.jobId).name}</div>)}
              {es.length > 3 && <div className="muted">+{es.length - 3} more</div>}
            </div>
          )
        })}
      </div></div>
    </>
  )
}

export function RunSheets() {
  const { db } = useStore()
  const [date, setDate] = useState(today())
  const [employeeId, setEmployeeId] = useState(pickable(db.employees)[0]?.id ?? '')
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
