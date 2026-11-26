import { useState } from 'react'
import { usePaged } from '../components/Paged'
import { useFilter, useStartOpen } from '../components/useFilter'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { QuoteForm } from './Simple'
import AiQuoteDraft from '../components/AiQuoteDraft'
import { useStore } from '../store'
import { computeCosting, money, STATUS_COLOR, STATUS_LABEL } from '../lib/costing'
import { dmy } from '../lib/dates'
import type { Quote, QuoteStatus } from '../types'

// When a quote was first made: the oldest timeline line (quotes have no separate created date in the app).
const quoteCreated = (q: Quote) => q.timeline[q.timeline.length - 1]?.at ?? q.updatedAt

export default function Quotes() {
  const { db, createQuote, canWrite, remote } = useStore()
  const nav = useNavigate()
  const startOpen = useStartOpen()
  const [open, setOpen] = useState(startOpen)
  const [ai, setAi] = useState(false)
  const filter = useFilter()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const jobOf = (id: number) => db.jobs.find((j) => j.quoteId === id)
  const cust = (id: string) => db.customers.find((c) => c.id === id)?.name ?? ''
  const site = (id: string) => db.sites.find((s) => s.id === id)?.name ?? ''
  const needsJob = (q: Quote) => q.status === 'approved' && !jobOf(q.id)
  const inTab = (q: Quote, f: string) => (f === 'needs_job' ? needsJob(q) : f ? q.status === f : true)
  const s = search.trim().toLowerCase()
  const rows = [...db.quotes]
    .sort((a, b) => quoteCreated(b).localeCompare(quoteCreated(a)) || b.id - a.id)
    .filter((q) => inTab(q, filter) && (!s || [q.id, q.name, cust(q.customerId), site(q.siteId)].join(' ').toLowerCase().includes(s)))
  const { shown, more } = usePaged(rows, `${filter}|${s}`)
  const STATUSES: QuoteStatus[] = ['to_be_completed', 'sent', 'approved', 'declined']
  const TABS: [string, string][] = [['', 'All'], ...STATUSES.map((k) => [k, STATUS_LABEL[k]] as [string, string]), ['needs_job', 'Accepted, needs a job']]
  const setFilter = (f: string) => { const p = new URLSearchParams(params); if (f) p.set('filter', f); else p.delete('filter'); setParams(p) }
  return (
    <>
      <div className="row between"><h1>Quotes ({db.quotes.length})</h1><div className="row">{canWrite && remote && <button className="ai-btn" disabled={!db.customers.length} onClick={() => setAi(true)}>✨ Draft with AI</button>}{canWrite && <button disabled={!db.customers.length} onClick={() => setOpen(true)}>+ New quote</button>}</div></div>
      {ai && <AiQuoteDraft onClose={() => setAi(false)} />}
      {open && (
        <QuoteForm
          customers={db.customers}
          sites={db.sites}
          onCancel={() => setOpen(false)}
          onSubmit={async (cid, sid, name) => { const id = await createQuote(cid, sid, name); if (id) nav(`/quotes/${id}`) }}
        />
      )}
      {db.quotes.length > 0 && (
        <>
          <div className="subtabs">
            {TABS.map(([k, label]) => (
              <button key={k || 'all'} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>
                {label} <span className="muted">{db.quotes.filter((q) => inTab(q, k)).length}</span>
              </button>
            ))}
          </div>
          <input className="wide" type="search" placeholder="Search by quote number, name, customer, site…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search quotes" style={{ marginBottom: 12 }} />
        </>
      )}
      {db.quotes.length === 0 && <p className="muted">No quotes yet. Use "+ New quote", or convert a lead.</p>}
      {db.quotes.length > 0 && rows.length === 0 && <p className="muted">No quotes match. Try another search or choose All.</p>}
      {rows.length > 0 && (
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Customer</th><th>Site</th><th>Created</th><th>Status</th><th>Total</th><th>Job</th></tr></thead>
          <tbody>
            {shown.map((q) => {
              const job = jobOf(q.id)
              return (
                <tr key={q.id}>
                  <td><Link to={`/quotes/${q.id}`}>{q.id}</Link></td>
                  <td><Link to={`/quotes/${q.id}`}>{q.name}</Link></td>
                  <td>{cust(q.customerId)}</td>
                  <td>{site(q.siteId)}</td>
                  <td>{dmy(new Date(quoteCreated(q)).toLocaleDateString('en-CA'))}</td>
                  <td><i className="dot" style={{ background: STATUS_COLOR[q.status] }} />{STATUS_LABEL[q.status]}</td>
                  <td>{money(computeCosting(q).total)}</td>
                  <td>{job ? <Link to={`/jobs?job=${job.id}`}>Job {job.id}</Link> : needsJob(q) ? <Link className="btn" to={`/quotes/${q.id}`}>Create job</Link> : <span className="muted">–</span>}</td>
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
