import type { Db, Job, JobCost } from '../types'
import { computeCosting } from './costing'
import { quoteNet } from './claims'
import { invoiceTotals } from './invoicing'

export interface JobCostSummary {
  revenue: number // quote price after discount, ex GST
  invoiced: number // invoiced so far, ex GST
  hours: number
  rate: number // $/hour used for labour (the quote's own average labour cost)
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

// Estimated cost comes from the quote. Actual labour is clocked hours at the quote's average labour cost per hour;
// everything else is what was recorded against the job.
export function jobCostSummary(db: Db, job: Job): JobCostSummary | null {
  const q = db.quotes.find((x) => x.id === job.quoteId)
  if (!q) return null
  const c = computeCosting(q)
  const revenue = quoteNet(q)
  const labour = q.costCenters.flatMap((cc) => cc.items).filter((i) => i.kind === 'labour')
  const labourQty = labour.reduce((a, i) => a + i.quantity, 0)
  const rate = labourQty > 0 ? labour.reduce((a, i) => a + i.quantity * i.unitCost, 0) / labourQty : 0
  const ms = db.clock.filter((k) => k.jobId === job.id).reduce((a, k) => a + (new Date(k.end ?? Date.now()).getTime() - new Date(k.start).getTime()), 0)
  const hours = ms / 3600000
  const costs = db.jobCosts.filter((x) => x.jobId === job.id)
  const actLabour = hours * rate
  const actMaterials = sum(costs, 'material')
  const actSubcontract = sum(costs, 'subcontract')
  const actOther = sum(costs, 'other')
  const actTotal = actLabour + actMaterials + actSubcontract + actOther
  const estTotal = c.materialsCost + c.resourcesCost
  const invoiced = db.invoices.filter((i) => i.jobId === job.id && !i.voided).reduce((a, i) => a + invoiceTotals(i).subTotal, 0)
  const pct = (n: number) => (revenue > 0 ? (n / revenue) * 100 : 0)
  return {
    revenue, invoiced, hours, rate,
    estLabour: c.resourcesCost, estMaterials: c.materialsCost,
    actLabour, actMaterials, actSubcontract, actOther, estTotal, actTotal,
    estProfit: revenue - estTotal, profit: revenue - actTotal, margin: pct(revenue - actTotal), estMargin: pct(revenue - estTotal),
  }
}
