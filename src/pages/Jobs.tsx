import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import JobPhotos from '../components/JobPhotos'
import { usePaged } from '../components/Paged'
import FilterBar, { useFilter } from '../components/FilterBar'
import { useStore } from '../store'
import { computeCosting, money } from '../lib/costing'
import { claimedPct, claimsFor, CLAIM_LABELS, quoteNet } from '../lib/claims'
import type { Job, JobStatus, Quote } from '../types'

export const JOB_LABEL: Record<JobStatus, string> = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  complete: 'Complete',
  invoiced: 'Invoiced',
}

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
  const { db, setJobStatus, createInvoiceFromJob, deleteJob, canWrite, profile } = useStore()
  const nav = useNavigate()
  const pend = useFilter() === 'pending'
  const rows = pend ? db.jobs.filter((j) => j.status === 'pending') : db.jobs
  const labels = db.settings.jobStatusLabels
  const { shown, more } = usePaged(rows)
  const changeStatus = (j: Job, status: JobStatus) => {
    if (status === 'complete' && db.settings.requireAuditsToComplete) {
      const q = db.quotes.find((x) => x.id === j.quoteId)
      const missing = (q?.forms ?? []).filter((fid) => !db.auditResults.some((r) => r.jobId === j.id && r.auditId === fid))
      if (missing.length) {
        alert(`Complete these audits first: ${missing.map((fid) => db.audits.find((a) => a.id === fid)?.name ?? 'a deleted audit').join(', ')}`)
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
      <FilterBar label="jobs waiting to be scheduled" shown={rows.length} total={db.jobs.length} />
      {db.jobs.length > 0 && (
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
                <tr key={j.id}>
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
                      {Object.entries(labels)
                        .filter(([k]) => k !== 'invoiced' || j.status === 'invoiced')
                        .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
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
                      <button className="link-btn" disabled={!!inv} title={inv ? 'This job has an invoice' : ''} onClick={() => confirm(`Delete job ${j.id}? Its schedule entries and audit results are removed too.`) && deleteJob(j.id)}>Delete</button>
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
