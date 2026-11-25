import { today } from '../lib/dates'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { money } from '../lib/costing'
import { jobCostSummary } from '../lib/jobcost'
import type { JobCost } from '../types'

const KINDS: { v: JobCost['kind']; label: string }[] = [
  { v: 'material', label: 'Materials' },
  { v: 'subcontract', label: 'Subcontractor' },
  { v: 'other', label: 'Other' },
]
const dmy = (s: string) => s.split('-').reverse().join('/')
const pctTxt = (n: number) => `${Math.round(n * 10) / 10}%`

export default function JobCosting() {
  const { id } = useParams()
  const { db, canWrite, addJobCost, deleteJobCost } = useStore()
  const job = db.jobs.find((j) => j.id === Number(id))
  const [kind, setKind] = useState<JobCost['kind']>('material')
  const [supplier, setSupplier] = useState('')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [confirmId, setConfirmId] = useState('')
  if (!job) return <p>Job not found. <Link to="/jobs">Back to jobs</Link></p>
  const s = jobCostSummary(db, job)
  if (!s) return <p>This job's quote is missing, so there is nothing to compare against.</p>
  const costs = db.jobCosts.filter((c) => c.jobId === job.id)
  const amt = Number(amount)
  const over = s.actTotal > s.estTotal
  const lines: { label: string; est: number | null; act: number; note?: string }[] = [
    { label: 'Labour', est: s.estLabour, act: s.actLabour, note: `${s.hours.toFixed(1)} h clocked at ${money(s.rate)}/h` },
    { label: 'Materials', est: s.estMaterials, act: s.actMaterials },
    { label: 'Subcontractors', est: null, act: s.actSubcontract },
    { label: 'Other', est: null, act: s.actOther },
  ]
  const add = () => {
    if (!(amt > 0)) return
    addJobCost({ jobId: job.id, date, kind, supplier: supplier.trim(), description: desc.trim(), amount: Math.round(amt * 100) / 100 })
    setSupplier(''); setDesc(''); setAmount('')
  }
  return (
    <>
      <div className="row between">
        <h1>Job {job.id} cost</h1>
        <Link className="btn" to="/jobs">Back to jobs</Link>
      </div>
      <p className="muted">{job.name}. Amounts are ex GST. The estimate comes from the quote; actual cost is clocked time plus what you record below.</p>

      <div className="jc-hero">
        <div className={`jc-profit ${s.profit < 0 ? 'neg' : ''}`}>
          <span className="muted">{s.actTotal === 0 ? 'Expected profit' : 'Profit so far'}</span>
          <b>{money(s.profit)}</b>
          <span>{s.actTotal === 0 ? 'Nothing recorded yet, so this is the full quote price' : `${pctTxt(s.margin)} margin · quoted ${pctTxt(s.estMargin)}`}</span>
        </div>
        <div><span className="muted">Quote price</span><b>{money(s.revenue)}</b></div>
        <div><span className="muted">Invoiced</span><b>{money(s.invoiced)}</b><span className="muted">{s.revenue > 0 ? pctTxt((s.invoiced / s.revenue) * 100) : ''} of quote</span></div>
        <div><span className="muted">Actual cost</span><b>{money(s.actTotal)}</b><span className={over ? 'jc-over' : 'muted'}>{over ? `${money(s.actTotal - s.estTotal)} over estimate` : `${money(s.estTotal - s.actTotal)} under estimate`}</span></div>
      </div>

      <table className="keep-table">
        <thead><tr><th>Cost</th><th className="num">Estimated</th><th className="num">Actual</th><th className="num">Difference</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label}>
              <td>{l.label}{l.note && <div className="muted">{l.note}</div>}</td>
              <td className="num">{l.est == null ? '–' : money(l.est)}</td>
              <td className="num">{money(l.act)}</td>
              <td className={`num ${l.est != null && l.act > l.est ? 'jc-over' : ''}`}>{l.est == null ? '' : money(l.act - l.est)}</td>
            </tr>
          ))}
          <tr className="jc-total"><td><b>Total cost</b></td><td className="num"><b>{money(s.estTotal)}</b></td><td className="num"><b>{money(s.actTotal)}</b></td><td className={`num ${over ? 'jc-over' : ''}`}><b>{money(s.actTotal - s.estTotal)}</b></td></tr>
        </tbody>
      </table>
      {s.rate === 0 && <p className="muted">The quote has no labour cost rate, so clocked hours are not costed. Add labour lines with a cost to the quote to include them.</p>}

      <h3>Costs recorded against this job</h3>
      {canWrite && (
        <div className="card jc-form">
          <div className="grid2">
            <label className="block">Type
              <select value={kind} onChange={(e) => setKind(e.target.value as JobCost['kind'])}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}</select>
            </label>
            <label className="block">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="block">Supplier<input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Reece Plumbing" /></label>
            <label className="block">Amount (ex GST)<input type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
          </div>
          <label className="block">What was it for<input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. 20 m conduit and fittings" /></label>
          <div className="row"><button className="primary" disabled={!(amt > 0)} onClick={add}>Add cost</button></div>
        </div>
      )}
      {costs.length === 0 ? <p className="muted">Nothing recorded yet. Add supplier bills and materials as they come in.</p> : (
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Supplier</th><th>Details</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {costs.map((c) => (
              <tr key={c.id}>
                <td>{dmy(c.date)}</td>
                <td>{KINDS.find((k) => k.v === c.kind)?.label}</td>
                <td>{c.supplier}</td>
                <td>{c.description}</td>
                <td className="num">{money(c.amount)}</td>
                <td>{canWrite && (confirmId === c.id ? <span className="row"><button onClick={() => { deleteJobCost(c.id); setConfirmId('') }}>Remove</button><button className="link-btn" onClick={() => setConfirmId('')}>Keep</button></span> : <button className="link-btn" onClick={() => setConfirmId(c.id)}>Remove</button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
