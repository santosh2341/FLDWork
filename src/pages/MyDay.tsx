import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Audit, Job, JobStatus } from '../types'
import JobPhotos from '../components/JobPhotos'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d) }
const nice = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })

// Phone-first screen for technicians: today's visits, tap to navigate or call, start/finish, run audits.
export default function MyDay() {
  const { db, profile, setJobStatus, saveAuditResult, addJobNote, clockOn, clockOff } = useStore()
  const me = useMemo(() => {
    const n = (profile?.fullName ?? '').trim().toLowerCase()
    return db.employees.find((e) => n && e.name.trim().toLowerCase() === n)?.id ?? ''
  }, [db.employees, profile])
  const [empId, setEmpId] = useState(me || db.employees[0]?.id || '')
  const [date, setDate] = useState(iso(new Date()))
  const [runFor, setRunFor] = useState<{ job: Job; audit: Audit } | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')
  const [noteText, setNoteText] = useState<Record<number, string>>({})

  const entries = db.schedule.filter((e) => e.employeeId === empId && e.date === date).sort((a, b) => a.start.localeCompare(b.start))
  const labels = db.settings.jobStatusLabels

  const finish = (j: Job) => {
    const q = db.quotes.find((x) => x.id === j.quoteId)
    const missing = (q?.forms ?? []).filter((fid) => !db.auditResults.some((r) => r.jobId === j.id && r.auditId === fid))
    if (db.settings.requireAuditsToComplete && missing.length) {
      setMsg(`Complete these audits first: ${missing.map((fid) => db.audits.find((a) => a.id === fid)?.name ?? 'a deleted audit').join(', ')}`)
      return
    }
    setMsg('')
    clockOff(j.id, empId)
    setJobStatus(j.id, 'complete')
  }

  const start = (j: Job) => {
    clockOn(j.id, empId)
    setJobStatus(j.id, 'in_progress')
  }

  const addNote = (j: Job) => {
    const t = (noteText[j.id] ?? '').trim()
    if (!t) return
    addJobNote(j.id, t, db.employees.find((e) => e.id === empId)?.name || profile?.fullName || '')
    setNoteText({ ...noteText, [j.id]: '' })
  }

  const worked = (jobId: number) => {
    const ms = db.clock.filter((c) => c.jobId === jobId && c.employeeId === empId).reduce((a, c) => a + (new Date(c.end ?? new Date().toISOString()).getTime() - new Date(c.start).getTime()), 0)
    const m = Math.round(ms / 60000)
    return m <= 0 ? '' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
  }

  const submitAudit = () => {
    if (!runFor) return
    const missing = runFor.audit.groups.flatMap((g) => g.questions.filter((q) => q.required && !answers[q.id]))
    if (missing.length) return setMsg(`${missing.length} required question(s) still need an answer.`)
    saveAuditResult({ auditId: runFor.audit.id, auditName: runFor.audit.name, jobId: runFor.job.id, snapshot: JSON.parse(JSON.stringify(runFor.audit.groups)), answers })
    setRunFor(null)
    setAnswers({})
    setMsg('Audit saved to the job.')
  }

  if (runFor) {
    return (
      <div className="myday">
        <button className="link-btn" onClick={() => { setRunFor(null); setMsg('') }}>← Back to my day</button>
        <h1>{runFor.audit.name}</h1>
        <p className="muted">Job {runFor.job.id} – {runFor.job.name}</p>
        {runFor.audit.groups.map((g) => (
          <div key={g.id} className="card">
            <h3>{g.name}</h3>
            {g.description && <p className="muted">{g.description}</p>}
            {g.questions.map((q) => (
              <label key={q.id} className="block">{q.text}{q.required && ' *'}
                {q.answerType === 'yesno' ? (
                  <div className="md-choice">
                    {['Yes', 'No', 'N/A'].map((o) => (
                      <button key={o} type="button" className={answers[q.id] === o ? 'primary' : ''} onClick={() => setAnswers({ ...answers, [q.id]: o })}>{o}</button>
                    ))}
                  </div>
                ) : (
                  <input
                    type={q.answerType === 'number' ? 'number' : 'text'}
                    inputMode={q.answerType === 'number' ? 'decimal' : undefined}
                    placeholder={q.answerType === 'photo' ? 'Photo note / file name' : q.answerType === 'signature' ? 'Type name as signature' : ''}
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  />
                )}
              </label>
            ))}
          </div>
        ))}
        {msg && <p className="error">{msg}</p>}
        <button className="primary md-big" onClick={submitAudit}>Save audit</button>
      </div>
    )
  }

  return (
    <div className="myday">
      <h1>My day</h1>
      <div className="md-date">
        <button onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
        <div><b>{date === iso(new Date()) ? 'Today' : nice(date)}</b><small>{nice(date)}</small></div>
        <button onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
      </div>
      {(!me || db.employees.length > 1) && (
        <label className="block">Showing visits for
          <select value={empId} onChange={(e) => setEmpId(e.target.value)}>
            {db.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
      )}
      {msg && <p className={msg.includes('saved') ? 'muted' : 'error'}>{msg}</p>}
      {entries.length === 0 && <p className="muted">Nothing scheduled for this day.</p>}
      {entries.map((e) => {
        const j = db.jobs.find((x) => x.id === e.jobId)
        if (!j) return null
        const c = db.customers.find((x) => x.id === j.customerId)
        const s = db.sites.find((x) => x.id === j.siteId)
        const addr = s?.address || c?.address || ''
        const q = db.quotes.find((x) => x.id === j.quoteId)
        const audits = (q?.forms ?? []).map((fid) => db.audits.find((a) => a.id === fid)).filter((a): a is Audit => !!a)
        const nav = s?.lat != null && s?.lng != null ? `${s.lat},${s.lng}` : addr
        return (
          <div key={e.id} className="card md-visit">
            <div className="row between">
              <b>{e.start}–{e.end}</b>
              <span className={`pill st-${j.status}`}>{labels[j.status as JobStatus]}</span>
            </div>
            <h3>{j.id} – {j.name}</h3>
            <p>{c?.name}{s ? ` · ${s.name}` : ''}</p>
            {addr && <p className="muted">{addr}</p>}
            {s?.accessNotes && <p className="md-access"><b>Access:</b> {s.accessNotes}</p>}
            <div className="md-actions">
              {nav && <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(nav)}`} target="_blank" rel="noreferrer">Navigate</a>}
              {c?.phone && <a className="btn" href={`tel:${c.phone.replace(/\s+/g, '')}`}>Call</a>}
            </div>
            {audits.length > 0 && (
              <div className="md-audits">
                {audits.map((a) => {
                  const done = db.auditResults.some((r) => r.jobId === j.id && r.auditId === a.id)
                  return (
                    <button key={a.id} onClick={() => { setRunFor({ job: j, audit: a }); setAnswers({}); setMsg('') }}>
                      {done ? '✓ ' : ''}{a.name}
                    </button>
                  )
                })}
              </div>
            )}
            {worked(j.id) && <p className="muted">Time on this job: <b>{worked(j.id)}</b>{db.clock.some((c) => c.jobId === j.id && c.employeeId === empId && !c.end) ? ' (clock running)' : ''}</p>}
            <div className="md-notes">
              <b>Notes</b>
              {db.jobNotes.filter((n) => n.jobId === j.id).slice(0, 5).map((n) => (
                <p key={n.id}><span className="muted">{n.author} · {new Date(n.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span><br />{n.text}</p>
              ))}
              <textarea rows={2} placeholder="Add a note (what you did, parts used, issues)" value={noteText[j.id] ?? ''} onChange={(ev) => setNoteText({ ...noteText, [j.id]: ev.target.value })} />
              <button disabled={!(noteText[j.id] ?? '').trim()} onClick={() => addNote(j)}>Add note</button>
            </div>
            <JobPhotos jobId={j.id} author={db.employees.find((x) => x.id === empId)?.name || profile?.fullName || ''} />
            {(j.status === 'scheduled' || j.status === 'pending') && <button className="primary md-big" onClick={() => start(j)}>Start job & clock on</button>}
            {j.status === 'in_progress' && <button className="primary md-big" onClick={() => finish(j)}>Mark complete & clock off</button>}
          </div>
        )
      })}
    </div>
  )
}
