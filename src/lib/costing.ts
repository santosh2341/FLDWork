import type { Quote } from '../types'

export const sellFromCost = (cost: number, markupPct: number) =>
  Math.round(cost * (1 + markupPct / 100) * 100) / 100

export interface Costing {
  materialsCost: number
  resourcesCost: number
  materialsMarkup: number
  resourcesMarkup: number
  discount: number
  subTotal: number
  tax: number
  total: number
  grossPL: number
  grossMargin: number
  netPL: number
  netMargin: number
}

// Formulas follow the guide, section 9.5.
export function computeCosting(q: Quote): Costing {
  let materialsCost = 0
  let resourcesCost = 0
  let materialsSell = 0
  let resourcesSell = 0
  for (const cc of q.costCenters) {
    for (const li of cc.items) {
      const cost = li.quantity * li.unitCost
      const sell = li.quantity * li.unitSell
      if (li.kind === 'part') {
        materialsCost += cost
        materialsSell += sell
      } else {
        resourcesCost += cost
        resourcesSell += sell
      }
    }
  }
  const materialsMarkup = materialsSell - materialsCost
  const resourcesMarkup = resourcesSell - resourcesCost
  const subTotal =
    materialsCost + resourcesCost + materialsMarkup + resourcesMarkup - q.discount
  const tax = subTotal * (q.taxRate / 100)
  const total = subTotal + tax
  const grossPL = subTotal - (materialsCost + resourcesCost)
  const netPL = grossPL - q.overheads
  const pct = (n: number) => (subTotal > 0 ? (n / subTotal) * 100 : 0)
  return {
    materialsCost,
    resourcesCost,
    materialsMarkup,
    resourcesMarkup,
    discount: q.discount,
    subTotal,
    tax,
    total,
    grossPL,
    grossMargin: pct(grossPL),
    netPL,
    netMargin: pct(netPL),
  }
}

export const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

export const STATUS_LABEL: Record<string, string> = {
  to_be_completed: 'To Be Completed',
  sent: 'Sent',
  approved: 'Approved',
  declined: 'Declined',
}

export const STATUS_COLOR: Record<string, string> = {
  to_be_completed: '#e0a100',
  sent: '#2f7fd1',
  approved: '#2e9e5b',
  declined: '#d1453b',
}
