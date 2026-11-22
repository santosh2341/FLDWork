import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { money } from '../lib/costing'
import { REPORTS, toCsv } from '../lib/reports'
import type { Cell, Column, Filters } from '../lib/reports'

export function ReportsHub() {
  return (
    <>
      <h1>Most Common Reports</h1>
      <div className="grid2">
        {REPORTS.map((r) => (
          <div key={r.id} className="card">
            <h3><Link to={`/reports/${r.id}`}>{r.title}</Link></h3>
            <p className="muted">{r.description}</p>
          </div>
        ))}
      </div>
    </>
  )
}

const fmt = (c: Column, v: Cell | undefined) => {
  if (v === undefined) return ''
  if (c.kind === 'money') return money(Number(v))
  if (c.kind === 'pct') return `${Number(v).toFixed(1)}%`
  return String(v)
}

export function ReportPage() {
  const { id } = useParams()
  const { db } = useStore()
  const def = REPORTS.find((r) => r.id === id)
  const [filters, setFilters] = useState<Filters>({ from: '', to: '', customerId: '' })
  const [applied, setApplied] = useState<Filters>(filters)

  const result = useMemo(() => (def ? def.run(db, applied) : null), [def, db, applied])
  if (!def || !result) return <p>Report not found. <Link to="/reports">Back to reports</Link></p>

  const download = () => {
    const blob = new Blob([toCsv(result.columns, result.rows)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${def.id}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const totals = result.columns.filter((c) => c.kind === 'money').map((c) => ({ c, sum: result.rows.reduce((a, r) => a + Number(r[c.key] ?? 0), 0) }))

  return (
    <>
      <h1>{def.title}</h1>
      <p className="muted">{def.description}</p>
      <div className="card no-print">
        <div className="row wrap">
          <label>From <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
          <label>To <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
          <label>Customer
            <select value={filters.customerId} onChange={(e) => setFilters({ ...filters, customerId: e.target.value })}>
              <option value="">All</option>
              {db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button className="primary" onClick={() => setApplied(filters)}>Display</button>
          <button onClick={() => window.print()}>Print</button>
          <button onClick={download}>Export CSV</button>
        </div>
      </div>
      <table>
        <thead><tr>{result.columns.map((c) => <th key={c.key} className={c.kind && c.kind !== 'text' ? 'num' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {result.rows.map((r, i) => (
            <tr key={i}>{result.columns.map((c) => <td key={c.key} className={c.kind && c.kind !== 'text' ? 'num' : ''}>{fmt(c, r[c.key])}</td>)}</tr>
          ))}
          {result.rows.length === 0 && <tr><td colSpan={result.columns.length} className="muted">No data for these filters.</td></tr>}
          {result.rows.length > 0 && totals.length > 0 && (
            <tr className="hl">
              {result.columns.map((c, i) => {
                const t = totals.find((x) => x.c.key === c.key)
                return <td key={c.key} className={t ? 'num' : ''}>{t ? money(t.sum) : i === 0 ? 'Totals' : ''}</td>
              })}
            </tr>
          )}
        </tbody>
      </table>
    </>
  )
}
