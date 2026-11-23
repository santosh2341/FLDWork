import { Link, useNavigate } from 'react-router-dom'
import FilterBar, { useFilter } from '../components/FilterBar'
import { useStore } from '../store'
import { computeCosting, money } from '../lib/costing'
import type { Job, JobStatus } from '../types'

export const JOB_LABEL: Record<JobStatus, string> = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  complete: 'Complete',
  invoiced: 'Invoiced',
}

export default function Jobs() {
  const { db, setJobStatus, createInvoiceFromJob, deleteJob, canWrite } = useStore()
  const nav = useNavigate()
  const pend = useFilter() === 'pending'
  const rows = pend ? db.jobs.filter((j) => j.status === 'pending') : db.jobs
  const labels = db.settings.jobStatusLabels
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
            {rows.map((j) => {
              const q = db.quotes.find((x) => x.id === j.quoteId)
              const inv = db.invoices.find((i) => i.jobId === j.id && !i.voided)
              return (
                <tr key={j.id}>
                  <td>{j.id} – {j.name}</td>
                  <td><Link to={`/quotes/${j.quoteId}`}>{j.quoteId}</Link></td>
                  <td>{db.customers.find((c) => c.id === j.customerId)?.name}</td>
                  <td>{db.sites.find((s) => s.id === j.siteId)?.name}</td>
                  <td>{q ? money(computeCosting(q).total) : ''}</td>
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
                      <button disabled={j.status !== 'complete'} title={j.status !== 'complete' ? 'Mark the job complete first' : ''} onClick={async () => { const id = await createInvoiceFromJob(j.id); if (id) nav(`/invoices/${id}`) }}>
                        Create invoice
                      </button>
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
    </>
  )
}
