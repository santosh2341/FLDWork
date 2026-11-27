import type { Db, Job, JobCost } from '../types'
import { computeCosting } from './costing'
import { quoteNet } from './claims'
import { invoiceTotals } from './invoicing'

export interface JobCostSummary {
  revenue: number // quote price after discount, ex GST
  invoiced: number // invoiced so far, ex GST
  hours: number
  rate: number // the quote's average labour cost per hour: used for anyone without their own cost rate
  unratedHours: number // clocked hours costed at the quote average because the person has no rate (or it is hidden from you)
  committed: number // ordered on job POs but not received yet, ex GST
  openPOs: number
  estLabour: number
  estMaterials: number
  actLabour: number
  actMaterials: number
  actSubcontract: number
  actOther: number
  estTotal: number
  actTotal: number
  estProfit: number
  profit: number
  margin: number
  estMargin: number
}

const sum = (rows: JobCost[], kind: JobCost['kind']) => rows.filter((r) => r.kind === kind).reduce((a, r) => a + r.amount, 0)

// Estimated cost comes from the quote. Actual labour is each clocked entry at that person's hourly cost
// (falling back to the quote's average labour cost per hour); everything else is what was recorded against the job,
// including goods received on job POs. Ordered-but-not-received job PO lines are reported as committed.
// Lookup tables built once per data load (the db object changes on every load or edit), so costing every job does
// not search every list for every job. Summaries are cached per db and job too.
interface Index { quotes: Map<number, Db['quotes'][number]>; clock: Map<number, Db['clock']>; costs: Map<number, JobCost[]>; pos: Map<number, Db['purchaseOrders']>; invoices: Map<number, Db['invoices']>; rates: Map<string, number | null | undefined>; summaries: Map<number, JobCostSummary | null> }
const indexCache = new WeakMap<Db, Index>()
const group = <T, K>(rows: T[], key: (r: T) => K) => { const m = new Map<K, T[]>(); for (const r of rows) { const k = key(r); const a = m.get(k); if (a) a.push(r); else m.set(k, [r]) } return m }
function indexOf(db: Db): Index {
  let ix = indexCache.get(db)
  if (!ix) {
    ix = {
      quotes: new Map(db.quotes.map((q) => [q.id, q])),
      clock: group(db.clock, (k) => k.jobId),
      costs: group(db.jobCosts, (c) => c.jobId),
      pos: group(db.purchaseOrders.filter((p) => p.jobId != null), (p) => p.jobId as number),
      invoices: group(db.invoices, (i) => i.jobId),
      rates: new Map(db.employees.map((e) => [e.id, e.costRate])),
      summaries: new Map(),
    }
    indexCache.set(db, ix)
  }
  return ix
}

export function jobCostSummary(db: Db, job: Job): JobCostSummary | null {
  const ix = indexOf(db)
  if (ix.summaries.has(job.id)) return ix.summaries.get(job.id) ?? null
  const s = jobCostSummaryUncached(ix, job)
  ix.summaries.set(job.id, s)
  return s
}

function jobCostSummaryUncached(ix: Index, job: Job): JobCostSummary | null {
  const q = ix.quotes.get(job.quoteId)
  if (!q) return null
  const c = computeCosting(q)
  const revenue = quoteNet(q)
  const labour = q.costCenters.flatMap((cc) => cc.items).filter((i) => i.kind === 'labour')
  const labourQty = labour.reduce((a, i) => a + i.quantity, 0)
  const rate = labourQty > 0 ? labour.reduce((a, i) => a + i.quantity * i.unitCost, 0) / labourQty : 0
  const now = Date.now()
  let hours = 0, unratedHours = 0, actLabour = 0
  for (const k of ix.clock.get(job.id) ?? []) {
    const h = (new Date(k.end ?? now).getTime() - new Date(k.start).getTime()) / 3600000
    const own = k.employeeId ? ix.rates.get(k.employeeId) : undefined
    hours += h
    if (own != null) actLabour += h * own
    else { unratedHours += h; actLabour += h * rate }
  }
  const costs = ix.costs.get(job.id) ?? []
  const jobPOs = (ix.pos.get(job.id) ?? []).filter((p) => p.status !== 'cancelled')
  const committed = jobPOs.reduce((a, p) => a + p.lines.reduce((b, l) => b + Math.max(0, l.qty - l.received) * l.unitCost, 0), 0)
  const openPOs = jobPOs.filter((p) => p.status === 'draft' || p.status === 'ordered').length
  const actMaterials = sum(costs, 'material')
  const actSubcontract = sum(costs, 'subcontract')
  const actOther = sum(costs, 'other')
  const actTotal = actLabour + actMaterials + actSubcontract + actOther
  const estTotal = c.materialsCost + c.resourcesCost
  const invoiced = (ix.invoices.get(job.id) ?? []).filter((i) => !i.voided).reduce((a, i) => a + invoiceTotals(i).subTotal, 0)
  const pct = (n: number) => (revenue > 0 ? (n / revenue) * 100 : 0)
  return {
    revenue, invoiced, hours, rate, unratedHours, committed, openPOs,
    estLabour: c.resourcesCost, estMaterials: c.materialsCost,
    actLabour, actMaterials, actSubcontract, actOther, estTotal, actTotal,
    estProfit: revenue - estTotal, profit: revenue - actTotal, margin: pct(revenue - actTotal), estMargin: pct(revenue - estTotal),
  }
}

// A job that is still open and has already cost more than the quote estimated. Drives the dashboard alert and ?filter=over_budget.
export function isOverBudget(db: Db, job: Job): boolean {
  if (job.status === 'invoiced') return false
  const s = jobCostSummary(db, job)
  return !!s && s.actTotal > s.estTotal + 0.005
}
