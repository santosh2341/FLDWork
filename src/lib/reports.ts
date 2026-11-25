import type { Db } from '../types'
import { computeCosting } from './costing'
import { daysOverdue, invoiceState, invoiceTotals, isUnpaid } from './invoicing'
import { fmtDate, hoursBetween } from './dates'
import { jobCostSummary } from './jobcost'

export type Cell = string | number
export interface Column {
  key: string
  label: string
  kind?: 'text' | 'num' | 'money' | 'pct'
}
export interface Filters {
  from: string
  to: string
  customerId: string
}
export interface ReportResult {
  columns: Column[]
  rows: Record<string, Cell>[]
  note?: string
}
export interface ReportDef {
  id: string
  title: string
  description: string
  run: (db: Db, f: Filters) => ReportResult
}

const inRange = (d: string, f: Filters) => (!f.from || d >= f.from) && (!f.to || d <= f.to)
const custOk = (id: string, f: Filters) => !f.customerId || id === f.customerId
const cname = (db: Db, id: string) => db.customers.find((c) => c.id === id)?.name ?? ''
const round2 = (n: number) => Math.round(n * 100) / 100

export const REPORTS: ReportDef[] = [
  {
    id: 'job-productivity',
    title: 'Job Productivity',
    description: 'Scheduled hours and jobs worked per employee in the date range.',
    run: (db, f) => ({
      columns: [
        { key: 'employee', label: 'Employee' },
        { key: 'jobs', label: 'Jobs worked', kind: 'num' },
        { key: 'hours', label: 'Scheduled hours', kind: 'num' },
      ],
      rows: db.employees.map((e) => {
        const es = db.schedule.filter((s) => s.employeeId === e.id && inRange(s.date, f))
        return {
          employee: e.name,
          jobs: new Set(es.map((s) => s.jobId)).size,
          hours: round2(es.reduce((a, s) => a + hoursBetween(s.start, s.end), 0)),
        }
      }),
    }),
  },
  {
    id: 'job-activity',
    title: 'Job Activity',
    description: 'Each job with its status, schedule entries, quote value and invoice.',
    run: (db, f) => ({
      columns: [
        { key: 'job', label: 'Job' },
        { key: 'customer', label: 'Customer' },
        { key: 'status', label: 'Status' },
        { key: 'entries', label: 'Schedule entries', kind: 'num' },
        { key: 'value', label: 'Quote value', kind: 'money' },
        { key: 'invoice', label: 'Invoice' },
      ],
      rows: db.jobs
        .filter((j) => custOk(j.customerId, f) && inRange(j.createdAt.slice(0, 10), f))
        .map((j) => {
          const q = db.quotes.find((x) => x.id === j.quoteId)
          const inv = db.invoices.find((i) => i.jobId === j.id && !i.voided)
          return {
            job: `${j.id} – ${j.name}`,
            customer: cname(db, j.customerId),
            status: j.status.replace('_', ' '),
            entries: db.schedule.filter((s) => s.jobId === j.id).length,
            value: q ? round2(computeCosting(q).total) : 0,
            invoice: inv ? `#${inv.id}` : '–',
          }
        }),
    }),
  },
  {
    id: 'job-wip',
    title: 'Job WIP',
    description: 'Jobs not yet invoiced, with the estimated cost of the work.',
    run: (db, f) => ({
      columns: [
        { key: 'job', label: 'Job' },
        { key: 'customer', label: 'Customer' },
        { key: 'status', label: 'Status' },
        { key: 'cost', label: 'Estimated cost', kind: 'money' },
        { key: 'value', label: 'Quote subtotal', kind: 'money' },
      ],
      rows: db.jobs
        .filter((j) => j.status !== 'invoiced' && custOk(j.customerId, f))
        .map((j) => {
          const q = db.quotes.find((x) => x.id === j.quoteId)
          const c = q ? computeCosting(q) : null
          return {
            job: `${j.id} – ${j.name}`,
            customer: cname(db, j.customerId),
            status: j.status.replace('_', ' '),
            cost: c ? round2(c.materialsCost + c.resourcesCost) : 0,
            value: c ? round2(c.subTotal) : 0,
          }
        }),
    }),
  },
  {
    id: 'price-discrepancies',
    title: 'Price Discrepancies',
    description: 'Purchase order lines whose unit cost differs from the catalog cost.',
    run: (db, f) => ({
      columns: [
        { key: 'po', label: 'PO' },
        { key: 'vendor', label: 'Vendor' },
        { key: 'part', label: 'Part' },
        { key: 'poCost', label: 'PO unit cost', kind: 'money' },
        { key: 'catCost', label: 'Catalog cost', kind: 'money' },
        { key: 'diff', label: 'Difference', kind: 'money' },
      ],
      rows: db.purchaseOrders
        .filter((po) => inRange(po.createdAt, f))
        .flatMap((po) =>
          po.lines.flatMap((l) => {
            const p = db.catalog.find((x) => x.id === l.partId)
            if (!p || Math.abs(p.cost - l.unitCost) < 0.005) return []
            return [{ po: String(po.id), vendor: po.vendor, part: p.description, poCost: l.unitCost, catCost: p.cost, diff: round2(l.unitCost - p.cost) }]
          }),
        ),
    }),
  },
  {
    id: 'inventory-value',
    title: 'Inventory Value',
    description: 'Quantity and value at cost for every part.',
    run: (db) => ({
      columns: [
        { key: 'partNo', label: 'Part no.' },
        { key: 'desc', label: 'Description' },
        { key: 'qty', label: 'Quantity', kind: 'num' },
        { key: 'cost', label: 'Unit cost', kind: 'money' },
        { key: 'value', label: 'Value', kind: 'money' },
      ],
      rows: db.catalog.map((p) => ({ partNo: p.partNo, desc: p.description, qty: p.stock, cost: p.cost, value: round2(p.stock * p.cost) })),
    }),
  },
  {
    id: 'inventory-required',
    title: 'Inventory Required',
    description: 'Parts needed by open quotes and un-invoiced jobs against current stock.',
    run: (db, f) => {
      const need: Record<string, number> = {}
      const quoteIds = new Set<number>()
      for (const q of db.quotes) if (q.status !== 'declined' && custOk(q.customerId, f)) quoteIds.add(q.id)
      for (const j of db.jobs) if (j.status === 'invoiced') quoteIds.delete(j.quoteId)
      for (const q of db.quotes.filter((x) => quoteIds.has(x.id)))
        for (const cc of q.costCenters) for (const i of cc.items) if (i.kind === 'part' && i.partId) need[i.partId] = (need[i.partId] ?? 0) + i.quantity
      return {
        columns: [
          { key: 'part', label: 'Part' },
          { key: 'required', label: 'Required', kind: 'num' },
          { key: 'stock', label: 'In stock', kind: 'num' },
          { key: 'short', label: 'To order', kind: 'num' },
        ],
        rows: Object.entries(need).map(([id, n]) => {
          const p = db.catalog.find((x) => x.id === id)
          return { part: p?.description ?? id, required: n, stock: p?.stock ?? 0, short: Math.max(0, n - (p?.stock ?? 0)) }
        }),
      }
    },
  },
  {
    id: 'profit-loss-job',
    title: 'Profit/Loss Job',
    description: 'Revenue, cost and margin per job, using the quote costing.',
    run: (db, f) => ({
      columns: [
        { key: 'job', label: 'Job' },
        { key: 'customer', label: 'Customer' },
        { key: 'revenue', label: 'Revenue', kind: 'money' },
        { key: 'cost', label: 'Cost', kind: 'money' },
        { key: 'pl', label: 'Gross P/L', kind: 'money' },
        { key: 'margin', label: 'Margin', kind: 'pct' },
      ],
      rows: db.jobs
        .filter((j) => custOk(j.customerId, f))
        .flatMap((j) => {
          const q = db.quotes.find((x) => x.id === j.quoteId)
          if (!q) return []
          const c = computeCosting(q)
          return [{ job: `${j.id} – ${j.name}`, customer: cname(db, j.customerId), revenue: round2(c.subTotal), cost: round2(c.materialsCost + c.resourcesCost), pl: round2(c.grossPL), margin: round2(c.grossMargin) }]
        }),
    }),
  },
  {
    id: 'job-profitability',
    title: 'Job Profitability',
    description: 'Quoted against actual cost per job: clocked labour at each person\'s rate, recorded costs and goods received on job POs. Filtered by the date the job was created.',
    run: (db, f) => ({
      columns: [
        { key: 'job', label: 'Job' },
        { key: 'customer', label: 'Customer' },
        { key: 'status', label: 'Status' },
        { key: 'revenue', label: 'Quote price', kind: 'money' },
        { key: 'est', label: 'Estimated cost', kind: 'money' },
        { key: 'act', label: 'Actual cost', kind: 'money' },
        { key: 'variance', label: 'Over (+) / under', kind: 'money' },
        { key: 'committed', label: 'Committed on POs', kind: 'money' },
        { key: 'estMargin', label: 'Quoted margin', kind: 'pct' },
        { key: 'margin', label: 'Actual margin', kind: 'pct' },
      ],
      rows: db.jobs
        .filter((j) => custOk(j.customerId, f) && inRange(fmtDate(new Date(j.createdAt)), f))
        .flatMap((j) => {
          const s = jobCostSummary(db, j)
          if (!s) return []
          return [{
            job: `${j.id} – ${j.name}`, customer: cname(db, j.customerId), status: db.settings.jobStatusLabels?.[j.status] ?? j.status,
            revenue: round2(s.revenue), est: round2(s.estTotal), act: round2(s.actTotal), variance: s.actTotal > 0 ? round2(s.actTotal - s.estTotal) : '',
            committed: round2(s.committed), estMargin: round2(s.estMargin), margin: s.actTotal > 0 ? round2(s.margin) : '',
          }]
        })
        .sort((a, b) => (b.variance === '' ? -Infinity : Number(b.variance)) - (a.variance === '' ? -Infinity : Number(a.variance))),
      note: 'Sorted by most over budget first. Over/under and actual margin stay blank until something is costed against the job.',
    }),
  },
  {
    id: 'customer-profitability',
    title: 'Customer Profitability',
    description: 'Jobs, quoted price and actual cost added up per customer. Over/under and margin so far use only jobs that have costs recorded. Filtered by the date the job was created.',
    run: (db, f) => {
      const by = new Map<string, { jobs: number; revenue: number; est: number; act: number; costedEst: number; costedRevenue: number }>()
      for (const j of db.jobs) {
        if (!custOk(j.customerId, f) || !inRange(fmtDate(new Date(j.createdAt)), f)) continue
        const s = jobCostSummary(db, j)
        if (!s) continue
        const t = by.get(j.customerId) ?? { jobs: 0, revenue: 0, est: 0, act: 0, costedEst: 0, costedRevenue: 0 }
        t.jobs += 1; t.revenue += s.revenue; t.est += s.estTotal; t.act += s.actTotal
        if (s.actTotal > 0) { t.costedEst += s.estTotal; t.costedRevenue += s.revenue } // over/under and margin only use jobs with costs so far
        by.set(j.customerId, t)
      }
      return {
        columns: [
          { key: 'customer', label: 'Customer' },
          { key: 'jobs', label: 'Jobs', kind: 'num' },
          { key: 'revenue', label: 'Quoted', kind: 'money' },
          { key: 'est', label: 'Estimated cost', kind: 'money' },
          { key: 'act', label: 'Actual cost', kind: 'money' },
          { key: 'variance', label: 'Over (+) / under', kind: 'money' },
          { key: 'margin', label: 'Margin so far', kind: 'pct' },
        ],
        rows: [...by.entries()]
          .map(([id, t]) => ({
            customer: cname(db, id), jobs: t.jobs, revenue: round2(t.revenue), est: round2(t.est), act: round2(t.act),
            variance: t.act > 0 ? round2(t.act - t.costedEst) : '', margin: t.costedRevenue > 0 ? round2(((t.costedRevenue - t.act) / t.costedRevenue) * 100) : '',
          }))
          .sort((a, b) => Number(b.revenue) - Number(a.revenue)),
      }
    },
  },
  {
    id: 'technician-hours',
    title: 'Technician Hours',
    description: 'Scheduled hours and clocked-on hours per employee, within the date range (by visit date).',
    run: (db, f) => ({
      columns: [
        { key: 'employee', label: 'Employee' },
        { key: 'visits', label: 'Visits', kind: 'num' },
        { key: 'scheduled', label: 'Scheduled hours', kind: 'num' },
        { key: 'clocked', label: 'Clocked hours', kind: 'num' },
        { key: 'diff', label: 'Clocked – scheduled', kind: 'num' },
      ],
      rows: db.employees.map((e) => {
        const visits = db.schedule.filter((s) => s.employeeId === e.id && inRange(s.date, f))
        const scheduled = visits.reduce((a, s) => a + hoursBetween(s.start, s.end), 0)
        const clocked = db.clock
          .filter((c) => c.employeeId === e.id && c.end && inRange(fmtDate(new Date(c.start)), f))
          .reduce((a, c) => a + (new Date(c.end as string).getTime() - new Date(c.start).getTime()) / 3600000, 0)
        return { employee: e.name, visits: visits.length, scheduled: round2(scheduled), clocked: round2(clocked), diff: round2(clocked - scheduled) }
      }),
    }),
  },
  {
    id: 'aged-receivables',
    title: 'Aged Receivables',
    description: 'Outstanding balances per customer in ageing buckets.',
    run: (db, f) => {
      const rows = db.customers
        .filter((c) => custOk(c.id, f))
        .map((c) => {
          const b = { current: 0, d30: 0, d60: 0, d90: 0, d91: 0 }
          for (const i of db.invoices.filter((x) => x.customerId === c.id && isUnpaid(x))) {
            const bal = invoiceTotals(i).balance
            const d = daysOverdue(i)
            if (d === 0) b.current += bal
            else if (d <= 30) b.d30 += bal
            else if (d <= 60) b.d60 += bal
            else if (d <= 90) b.d90 += bal
            else b.d91 += bal
          }
          const total = b.current + b.d30 + b.d60 + b.d90 + b.d91
          return { customer: c.name, current: round2(b.current), d30: round2(b.d30), d60: round2(b.d60), d90: round2(b.d90), d91: round2(b.d91), total: round2(total) }
        })
        .filter((r) => r.total > 0)
      return {
        columns: [
          { key: 'customer', label: 'Customer' },
          { key: 'current', label: 'Current', kind: 'money' },
          { key: 'd30', label: '1-30', kind: 'money' },
          { key: 'd60', label: '31-60', kind: 'money' },
          { key: 'd90', label: '61-90', kind: 'money' },
          { key: 'd91', label: '91+', kind: 'money' },
          { key: 'total', label: 'Total', kind: 'money' },
        ],
        rows,
      }
    },
  },
  {
    id: 'sales-invoices',
    title: 'Sales Invoices',
    description: 'All customer invoices issued in the date range.',
    run: (db, f) => ({
      columns: [
        { key: 'invoice', label: 'Invoice' },
        { key: 'customer', label: 'Customer' },
        { key: 'issued', label: 'Issued' },
        { key: 'state', label: 'Status' },
        { key: 'total', label: 'Total', kind: 'money' },
        { key: 'paid', label: 'Paid', kind: 'money' },
        { key: 'balance', label: 'Balance', kind: 'money' },
      ],
      rows: db.invoices
        .filter((i) => custOk(i.customerId, f) && inRange(i.issuedAt, f))
        .map((i) => {
          const t = invoiceTotals(i)
          return { invoice: `#${i.id}`, customer: cname(db, i.customerId), issued: i.issuedAt, state: invoiceState(i), total: round2(t.total), paid: round2(t.paid), balance: round2(t.balance) }
        }),
    }),
  },
  {
    id: 'monthly-breakdown',
    title: 'Monthly Breakdown',
    description: 'Amount invoiced per month (excluding voided invoices).',
    run: (db, f) => {
      const by: Record<string, { n: number; total: number }> = {}
      for (const i of db.invoices) {
        if (i.voided || !custOk(i.customerId, f) || !inRange(i.issuedAt, f)) continue
        const m = i.issuedAt.slice(0, 7)
        by[m] = by[m] ?? { n: 0, total: 0 }
        by[m].n += 1
        by[m].total += invoiceTotals(i).total
      }
      return {
        columns: [
          { key: 'month', label: 'Month' },
          { key: 'count', label: 'Invoices', kind: 'num' },
          { key: 'total', label: 'Invoiced', kind: 'money' },
        ],
        rows: Object.entries(by).sort().map(([m, v]) => ({ month: m, count: v.n, total: round2(v.total) })),
      }
    },
  },
]

export function toCsv(cols: Column[], rows: Record<string, Cell>[]) {
  const esc = (v: Cell) => `"${String(v).replace(/"/g, '""')}"`
  return [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(r[c.key] ?? '')).join(','))].join('\n')
}
