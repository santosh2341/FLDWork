import { useDialog } from '../components/dialog'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import JobPhotos from '../components/JobPhotos'
import { usePaged } from '../components/Paged'
import { useFilter } from '../components/useFilter'
import { useStore } from '../store'
import { computeCosting, money } from '../lib/costing'
import { claimedPct, claimsFor, CLAIM_LABELS, quoteNet } from '../lib/claims'
import { dmy, today } from '../lib/dates'
import { isOverBudget } from '../lib/jobcost'
import type { Job, JobStatus, Quote } from '../types'

// Bill part of a job now (deposit, progress, completion) instead of one invoice at the end.
function ClaimForm({ job, quote }: { job: Job; quote: Quote }) {
  const { db, createProgressClaim } = useStore()
  const nav = useNavigate()
  const done = claimedPct(db.invoices, job.id)
  const left = Math.round((100 - done) * 100) / 100
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState(done === 0 ? 'Deposit' : left <= 50 ? 'Completion' : 'Progress claim')
  const [pct, setPct] = useState(String(done === 0 ? 30 : left))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Number(pct)
  const net = quoteNet(quote)
  const amt = Math.round(net * n) / 100
  if (left <= 0) return null
  if (!open) return <button className="link-btn" onClick={() => setOpen(true)}>{done > 0 ? `+ Claim (${left}% left)` : 'Bill in stages'}</button>
  const go = async () => {
    setBusy(true); setErr('')
    const r = await createProgressClaim(job.id, label, n)
    setBusy(false)
    if (r.error) setErr(r.error)
    else if (r.id) nav(`/invoices/${r.id}`)
  }
  return (
    <div className="claim-form">
      <b>New progress claim</b>
      <label className="block">Stage
        <select value={CLAIM_LABELS.includes(label) ? label : 'Other'} onChange={(e) => setLabel(e.target.value === 'Other' ? '' : e.target.value)}>
          {CLAIM_LABELS.map((l) => <option key={l}>{l}</option>)}<option>Other</option>
        </select>
      </label>
      {!CLAIM_LABELS.includes(label) && <input placeholder="Stage name, e.g. Rough-in" value={label} onChange={(e) => setLabel(e.target.value)} />}
      <label className="block">Percent of quote ({left}% left)
        <input type="number" min={1} max={left} step="any" value={pct} onChange={(e) => setPct(e.target.value)} />
      </label>
      <p className="muted">{n > 0 ? `${money(amt)} + GST = ${money(amt * (1 + quote.taxRate / 100))}` : 'Enter a percentage'}</p>
      {n > left && <p className="error">Only {left}% is left to claim on this job.</p>}
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button className="primary" disabled={busy || !(n > 0 && n <= left)} onClick={go}>Create claim</button>
        <button onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}

// Photos load only after the row is opened, so a long job list does not fetch or decode every picture up front.
function PhotosToggle({ jobId, count, author, canAdd }: { jobId: number; count: number; author: string; canAdd: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <details onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="muted">Photos ({count})</summary>
      {open && <JobPhotos jobId={jobId} author={author} canAdd={canAdd} />}
    </details>
  )
}

export default function Jobs() {
  const { ask, tell } = useDialog()
  const { db, setJobStatus, createInvoiceFromJob, deleteJob, canWrite, profile } = useStore()
  const nav = useNavigate()
  const filter = useFilter()
  const [params, setParams] = useSearchParams()
  const focusId = Number(params.get('job')) || null // a job to show first and highlight (just created, or picked in search)
  const created = (useLocation().state as { createdJob?: number } | null)?.createdJob // set by "Create job" on a quote
  const [search, setSearch] = useState('')
  const labels = db.settings.jobStatusLabels
  const custName = (id: string) => db.customers.find((c) => c.id === id)?.name ?? ''
  const siteName = (id: string) => db.sites.find((s) => s.id === id)?.name ?? ''
  // newest first (job numbers are not in creation order: demo jobs use higher numbers)
  const sorted = [...db.jobs].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id - a.id)
  const inFilter = (j: Job) =>
    filter === 'over_budget' ? isOverBudget(db, j) : filter && filter in labels ? j.status === filter : true
  const s = search.trim().toLowerCase()
  const matches = (j: Job) => !s || [j.id, j.quoteId, j.name, custName(j.customerId), siteName(j.siteId)].join(' ').toLowerCase().includes(s)
  const filtered = sorted.filter((j) => inFilter(j) && matches(j))
  const focus = focusId ? db.jobs.find((j) => j.id === focusId) : undefined
  const rows = focus ? [focus, ...filtered.filter((j) => j.id !== focus.id)] : filtered
  const { shown, more } = usePaged(rows, `${filter}|${s}|${focusId ?? ''}`)
  const setFilter = (f: string) => { const p = new URLSearchParams(params); if (f) p.set('filter', f); else p.delete('filter'); p.delete('job'); setParams(p) }
  const count = (f: string) => db.jobs.filter((j) => (f === 'over_budget' ? isOverBudget(db, j) : f ? j.status === f : true)).length
  const ORDER: JobStatus[] = ['pending', 'scheduled', 'in_progress', 'complete', 'invoiced'] // workflow order
  const TABS: [string, string][] = [['', 'All'], ...ORDER.map((k) => [k, labels[k] ?? k] as [string, string]), ['over_budget', 'Over budget']]
  // the next booked visit for a job (today or later, else the latest one)
  const nextVisit = (jobId: number) => {
    const vs = db.schedule.filter((e) => e.jobId === jobId).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    const t = today()
    return vs.find((e) => e.date >= t) ?? vs[vs.length - 1]
  }

  // bring the highlighted job into view once
  useEffect(() => {
    if (!focusId) return
    const t = window.setTimeout(() => document.getElementById(`job-${focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150)
    return () => window.clearTimeout(t)
  }, [focusId])
  const changeStatus = (j: Job, status: JobStatus) => {
    if (status === 'complete' && db.settings.requireAuditsToComplete) {
      const q = db.quotes.find((x) => x.id === j.quoteId)
      const missing = (q?.forms ?? []).filter((fid) => !db.auditResults.some((r) => r.jobId === j.id && r.auditId === fid))
      if (missing.length) {
        void tell(`Complete these audits first: ${missing.map((fid) => db.audits.find((a) => a.id === fid)?.name ?? 'a deleted audit').join(', ')}`)
        return
      }
    }
    setJobStatus(j.id, status)
  }
  return (
    <>
      <h1>Jobs ({db.jobs.length})</h1>
      {db.jobs.length === 0 && (
        <p className="muted">No jobs yet. Approve a quote, then use "Create job" on the quote.</p>
      )}
      {db.jobs.length > 0 && (
        <>
          <div className="subtabs">
            {TABS.map(([k, label]) => (
              <button key={k || 'all'} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>
                {label} <span className="muted">{count(k)}</span>
              </button>
            ))}
          </div>
          <input className="wide" type="search" placeholder="Search by job or quote number, customer, site…" value={search}
            onChange={(e) => { setSearch(e.target.value); if (focusId) { const p = new URLSearchParams(params); p.delete('job'); setParams(p, { replace: true }) } }}
            aria-label="Search jobs" style={{ marginBottom: 12 }} />
          {focus && created === focus.id && (
            <div className="filter-bar">
              <span>Job <b>#{focus.id}</b> created from quote #{focus.quoteId}. It is waiting to be scheduled.</span>
              <Link className="btn" to={`/schedules/week?book=${focus.id}`}>Schedule it</Link>
            </div>
          )}
          {rows.length === 0 && <p className="muted">No jobs match. Try another search or choose All.</p>}
        </>
      )}
      {db.jobs.length > 0 && rows.length > 0 && (
        <table>
          <thead>
            <tr><th>Job</th><th>Quote</th><th>Customer</th><th>Site</th><th>Value</th><th>Status</th><th /><th /></tr>
          </thead>
          <tbody>
            {shown.map((j) => {
              const q = db.quotes.find((x) => x.id === j.quoteId)
              const inv = db.invoices.find((i) => i.jobId === j.id && !i.voided && i.claimPct == null)
              const claims = claimsFor(db.invoices, j.id)
              return (
                <tr key={j.id} id={`job-${j.id}`} className={j.id === focusId ? 'row-focus' : undefined}>
                  <td>{j.id} – {j.name}{(() => {
                    const notes = db.jobNotes.filter((n) => n.jobId === j.id)
                    const mins = Math.round(db.clock.filter((c) => c.jobId === j.id).reduce((t, c) => t + (new Date(c.end ?? Date.now()).getTime() - new Date(c.start).getTime()), 0) / 60000)
                    if (!notes.length && mins <= 0) return null
                    return <><br /><span className="muted">{mins > 0 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m on site` : ''}{mins > 0 && notes.length ? ' · ' : ''}{notes.length ? `${notes.length} note${notes.length > 1 ? 's' : ''}: “${notes[0].text.slice(0, 60)}”` : ''}</span></>
                  })()}
                  <PhotosToggle jobId={j.id} count={db.jobPhotos.filter((p) => p.jobId === j.id).length} author={profile?.fullName ?? ''} canAdd={canWrite} /></td>
                  <td><Link to={`/quotes/${j.quoteId}`}>{j.quoteId}</Link></td>
                  <td>{db.customers.find((c) => c.id === j.customerId)?.name}</td>
                  <td>{db.sites.find((s) => s.id === j.siteId)?.name}</td>
                  <td>{q ? money(computeCosting(q).total) : ''}{q && <><br /><Link className="muted" to={`/jobs/${j.id}/costing`}>Job cost</Link></>}</td>
                  <td>
                    <select
                      value={j.status}
                      disabled={j.status === 'invoiced'}
                      onChange={(e) => changeStatus(j, e.target.value as JobStatus)}
                    >
                      {ORDER
                        .filter((k) => k !== 'invoiced' || j.status === 'invoiced')
                        .map((k) => <option key={k} value={k}>{labels[k] ?? k}</option>)}
                    </select>
                    {(() => {
                      const v = nextVisit(j.id)
                      if (v) {
                        const who = db.employees.find((e) => e.id === v.employeeId)?.name ?? ''
                        return <div className="muted job-visit"><Link to={`/schedules/week?week=${v.date}`}>{dmy(v.date)} {v.start}</Link>{who ? ` · ${who}` : ''}</div>
                      }
                      return canWrite && j.status === 'pending' ? <Link className="btn job-sched" to={`/schedules/week?book=${j.id}`}>Schedule</Link> : null
                    })()}
                  </td>
                  <td>
                    {inv ? (
                      <Link to={`/invoices/${inv.id}`}>Invoice #{inv.id}</Link>
                    ) : (
                      <>
                        {claims.map((c) => <div key={c.id}><Link to={`/invoices/${c.id}`}>#{c.id}</Link> <span className="muted">{c.claimLabel} {c.claimPct}%</span></div>)}
                        {claims.length === 0 && (
                          <button disabled={j.status !== 'complete'} title={j.status !== 'complete' ? 'Mark the job complete first' : ''} onClick={async () => { const id = await createInvoiceFromJob(j.id); if (id) nav(`/invoices/${id}`) }}>
                            Create invoice
                          </button>
                        )}
                        {canWrite && q && j.status !== 'invoiced' && <ClaimForm job={j} quote={q} />}
                      </>
                    )}
                  </td>
                  <td>
                    {canWrite && (
                      <button className="link-btn" disabled={!!inv} title={inv ? 'This job has an invoice' : ''} onClick={async () => { if (await ask({ message: `Delete job ${j.id}? Its schedule entries and audit results are removed too.`, confirmLabel: 'Delete job', danger: true })) deleteJob(j.id) }}>Delete</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {more}
    </>
  )
}
