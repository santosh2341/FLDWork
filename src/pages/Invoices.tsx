import { useState } from 'react'
import FilterBar from '../components/FilterBar'
import { useFilter } from '../components/useFilter'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { daysOverdue, invoiceState, invoiceTotals, isUnpaid, STATE_COLOR, STATE_LABEL, withLog } from '../lib/invoicing'
import type { InvoiceState, InvoiceTotals } from '../lib/invoicing'
import { money } from '../lib/costing'
import { downloadCsv } from '../lib/csv'
import { exportXeroInvoices } from '../lib/accounting'
import type { Invoice } from '../types'
import RetainageTable from './Retainages'
import { usePaged } from '../components/Paged'

type Filter = 'unpaid' | 'paid' | 'all' | 'payments' | 'credits' | 'retainages'

const TABS: { key: Filter; label: string; to: string }[] = [
  { key: 'all', label: 'All', to: '/invoices/all' },
  { key: 'unpaid', label: 'Unpaid', to: '/invoices' },
  { key: 'paid', label: 'Paid', to: '/invoices/paid' },
  { key: 'payments', label: 'Payments', to: '/invoices/payments' },
  { key: 'credits', label: 'Credits', to: '/invoices/credits' },
  { key: 'retainages', label: 'Retainages', to: '/invoices/retainages' },
]

type Cell = string | number
interface InvRow { inv: Invoice; t: InvoiceTotals; st: InvoiceState; customer: string; site: string }
interface SortState { key: string; dir: 1 | -1 }

function sortRows<T>(rows: T[], sort: SortState, val: (r: T, key: string) => Cell): T[] {
  return [...rows].sort((a, b) => {
    const x = val(a, sort.key)
    const y = val(b, sort.key)
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
    return c * sort.dir
  })
}

export default function Invoices({ initial = 'unpaid' as Filter }) {
  const { db, saveInvoice } = useStore()
  const nav = useNavigate()
  const filter = initial
  const overdueOnly = useFilter() === 'overdue'
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortState>({ key: 'id', dir: -1 })

  const custName = (id: string) => db.customers.find((c) => c.id === id)?.name ?? ''
  const siteName = (id: string) => db.sites.find((s) => s.id === id)?.name ?? ''
  const match = (text: string) => text.toLowerCase().includes(q.trim().toLowerCase())
  const toggle = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  const th = (key: string, label: string, cls = '') => (
    <th className={cls} style={{ cursor: 'pointer' }} onClick={() => toggle(key)}>
      {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const invoiceRows: InvRow[] = db.invoices
    .filter((i) => (filter === 'unpaid' ? isUnpaid(i) : filter === 'paid' ? invoiceState(i) === 'paid' : true))
    .filter((i) => !overdueOnly || (isUnpaid(i) && daysOverdue(i) > 0))
    .filter((i) => match(`${i.id} ${i.jobId} ${custName(i.customerId)} ${siteName(i.siteId)}`))
    .map((i) => ({ inv: i, t: invoiceTotals(i), st: invoiceState(i), customer: custName(i.customerId), site: siteName(i.siteId) }))
  const invVal = (r: InvRow, key: string): Cell => {
    switch (key) {
      case 'id': return r.inv.id
      case 'status': return STATE_LABEL[r.st]
      case 'job': return r.inv.jobId
      case 'issued': return r.inv.issuedAt
      case 'due': return r.inv.dueAt
      case 'days': return isUnpaid(r.inv) ? daysOverdue(r.inv) : -1
      case 'customer': return r.customer
      case 'site': return r.site
      case 'price': return r.t.total
      case 'paid': return r.t.paid
      default: return ''
    }
  }

  const payRows = db.invoices
    .flatMap((i) => i.payments.map((p) => ({ date: p.date, invoice: i.id, customer: custName(i.customerId), method: p.method, amount: p.amount })))
    .filter((r) => match(`${r.invoice} ${r.customer} ${r.method}`))
  const creditRows = db.invoices
    .flatMap((i) => (i.credits ?? []).map((c) => ({ date: c.date, invoice: i.id, customer: custName(i.customerId), reason: c.reason, amount: c.amount })))
    .filter((r) => match(`${r.invoice} ${r.customer} ${r.reason}`))
  const flatVal = (r: Record<string, Cell>, key: string): Cell => r[key] ?? ''
  const pageKey = `${filter}|${overdueOnly}|${q}|${sort.key}|${sort.dir}`
  const invPage = usePaged(sortRows(invoiceRows, sort, invVal), pageKey)
  const payPage = usePaged(sortRows<(typeof payRows)[number]>(payRows, sort, flatVal), pageKey)
  const creditPage = usePaged(sortRows<(typeof creditRows)[number]>(creditRows, sort, flatVal), pageKey)

  const heading = { unpaid: 'Unpaid Invoices', paid: 'Paid Invoices', all: 'All Invoices', payments: 'Payments', credits: 'Credits', retainages: 'Retainages' }[filter]
  const count = filter === 'payments' ? payRows.length : filter === 'credits' ? creditRows.length : filter === 'retainages' ? db.invoices.filter((x) => !x.voided && (x.retainagePct ?? 0) > 0).length : invoiceRows.length
  const outstanding = invoiceRows.reduce((a, r) => (isUnpaid(r.inv) ? a + r.t.balance : a), 0)

  const option = (inv: Invoice, action: string) => {
    if (action === 'view') nav(`/invoices/${inv.id}`)
    if (action === 'pay') nav(`/invoices/${inv.id}?tab=Payments`)
    if (action === 'void' && confirm(`Void invoice #${inv.id}?`)) saveInvoice(withLog({ ...inv, voided: true }, 'Invoice voided'))
  }

  const exportCsv = () => {
    if (filter === 'payments') {
      downloadCsv('payments.csv', ['Date', 'Invoice', 'Customer', 'Method', 'Amount'], sortRows<(typeof payRows)[number]>(payRows, sort, flatVal).map((r) => [r.date, r.invoice, r.customer, r.method, r.amount]))
    } else if (filter === 'credits') {
      downloadCsv('credits.csv', ['Date', 'Invoice', 'Customer', 'Reason', 'Amount'], sortRows<(typeof creditRows)[number]>(creditRows, sort, flatVal).map((r) => [r.date, r.invoice, r.customer, r.reason, r.amount]))
    } else {
      downloadCsv(
        `${filter}-invoices.csv`,
        ['Invoice', 'Status', 'Job', 'Issued', 'Due', 'Days overdue', 'Customer', 'Site', 'Price', 'Paid'],
        sortRows(invoiceRows, sort, invVal).map((r) => [r.inv.id, STATE_LABEL[r.st], r.inv.jobId, r.inv.issuedAt, r.inv.dueAt, isUnpaid(r.inv) ? daysOverdue(r.inv) : '', r.customer, r.site, r.t.total.toFixed(2), r.t.paid.toFixed(2)]),
      )
    }
  }

  return (
    <>
      <div className="row between">
        <h1>{heading} ({count})</h1>
        <div className="row">
          <button onClick={() => { if (!exportXeroInvoices(db)) alert('No approved or sent invoices to export yet.') }} title="Sent and approved invoices, in Xero's sales invoice import layout">Export for Xero</button>
          <button onClick={exportCsv} disabled={count === 0 || filter === 'retainages'}>Export CSV</button>
        </div>
      </div>
      <div className="subtabs">
        {TABS.map((t) => (
          <button key={t.key} className={t.key === filter ? 'active' : ''} onClick={() => nav(t.to)}>{t.label}</button>
        ))}
      </div>
      <FilterBar label="overdue invoices" shown={invoiceRows.length} total={db.invoices.length} />
      <input className="wide" placeholder="Search invoice, job, customer or site…" value={q} onChange={(e) => setQ(e.target.value)} />
      {filter === 'unpaid' && <p className="muted">Outstanding balance: <b>{money(outstanding)}</b></p>}

      {(filter === 'unpaid' || filter === 'paid' || filter === 'all') && (
        <table>
          <thead>
            <tr>
              {th('id', 'Invoice')}{th('status', 'Status')}{th('job', 'Job')}{th('issued', 'Issued')}{th('due', 'Due')}
              {th('days', 'Days overdue', 'num')}{th('customer', 'Customer')}{th('site', 'Site')}
              {th('price', 'Price', 'num')}{th('paid', 'Paid', 'num')}<th>Options</th>
            </tr>
          </thead>
          <tbody>
            {invPage.shown.map((r) => (
              <tr key={r.inv.id}>
                <td><Link to={`/invoices/${r.inv.id}`}>{r.inv.id}</Link></td>
                <td><i className="dot" title={STATE_LABEL[r.st]} style={{ background: STATE_COLOR[r.st] }} />{STATE_LABEL[r.st]}</td>
                <td>{r.inv.jobId || '–'}</td>
                <td>{r.inv.issuedAt}</td>
                <td>{r.inv.dueAt}</td>
                <td className="num">{isUnpaid(r.inv) ? daysOverdue(r.inv) : '–'}</td>
                <td>{r.customer}</td>
                <td>{r.site}</td>
                <td className="num">{money(r.t.total)}</td>
                <td className="num">{money(r.t.paid)}</td>
                <td>
                  <select value="" onChange={(e) => option(r.inv, e.target.value)} aria-label={`Options for invoice ${r.inv.id}`}>
                    <option value="">Options</option>
                    <option value="view">View</option>
                    {!r.inv.voided && <option value="pay">Record payment</option>}
                    {!r.inv.voided && r.t.paid === 0 && <option value="void">Void</option>}
                  </select>
                </td>
              </tr>
            ))}
            {invoiceRows.length === 0 && <tr><td colSpan={11} className="muted">No invoices.</td></tr>}
          </tbody>
        </table>
      )}
      {invPage.more}

      {filter === 'payments' && (
        <table>
          <thead><tr>{th('date', 'Date')}{th('invoice', 'Invoice')}{th('customer', 'Customer')}{th('method', 'Method')}{th('amount', 'Amount', 'num')}</tr></thead>
          <tbody>
            {payPage.shown.map((r, i) => (
              <tr key={i}>
                <td>{r.date}</td><td><Link to={`/invoices/${r.invoice}`}>{r.invoice}</Link></td>
                <td>{r.customer}</td><td>{r.method}</td><td className="num">{money(r.amount)}</td>
              </tr>
            ))}
            {payRows.length === 0 && <tr><td colSpan={5} className="muted">No payments recorded.</td></tr>}
          </tbody>
        </table>
      )}
      {payPage.more}

      {filter === 'retainages' && <RetainageTable />}

      {filter === 'credits' && (
        <table>
          <thead><tr>{th('date', 'Date')}{th('invoice', 'Invoice')}{th('customer', 'Customer')}{th('reason', 'Reason')}{th('amount', 'Amount', 'num')}</tr></thead>
          <tbody>
            {creditPage.shown.map((r, i) => (
              <tr key={i}>
                <td>{r.date}</td><td><Link to={`/invoices/${r.invoice}`}>{r.invoice}</Link></td>
                <td>{r.customer}</td><td>{r.reason}</td><td className="num">{money(r.amount)}</td>
              </tr>
            ))}
            {creditRows.length === 0 && <tr><td colSpan={5} className="muted">No credits issued. Issue one from an invoice's Payments tab.</td></tr>}
          </tbody>
        </table>
      )}
      {creditPage.more}
    </>
  )
}
