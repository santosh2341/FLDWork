import type { CostCenter, Customer, Db, Invoice, Quote, Site } from '../types'

const items = (cs: CostCenter[]) => cs.flatMap((c) => c.items)

function shared(db: Db, cust: Customer | undefined, site: Site | undefined, cs: CostCenter[], out: string[]) {
  const all = items(cs)
  if (!cust) out.push('No customer is set.')
  else if (cust.onHold) out.push(`${cust.name} is on hold.`)
  if (!cust?.email) out.push('The customer has no email address, so it cannot be emailed.')
  if (!site) out.push('No site is set.')
  if (all.length === 0) out.push('There are no line items.')
  all.forEach((i) => {
    if (!i.description.trim()) out.push('A line item has no description.')
    if (!(i.quantity > 0)) out.push(`"${i.description || 'Line item'}" has a quantity of zero.`)
    if (!(i.unitSell > 0)) out.push(`"${i.description || 'Line item'}" has no sell price.`)
    else if (i.unitCost > 0 && i.unitSell < i.unitCost) out.push(`"${i.description}" is priced below cost.`)
  })
  if (!db.settings.company?.abn) out.push('Your ABN is not set (Settings > General), so it will not print as a Tax Invoice.')
}

export function quoteIssues(db: Db, q: Quote): string[] {
  const out: string[] = []
  shared(db, db.customers.find((c) => c.id === q.customerId), db.sites.find((s) => s.id === q.siteId), q.costCenters, out)
  if (!q.description.trim()) out.push('The scope description is empty.')
  if (q.discount > 0 && q.discount >= items(q.costCenters).reduce((a, i) => a + i.quantity * i.unitSell, 0)) out.push('The discount is as large as the whole quote.')
  return [...new Set(out)]
}

export function invoiceIssues(db: Db, inv: Invoice): string[] {
  const out: string[] = []
  shared(db, db.customers.find((c) => c.id === inv.customerId), db.sites.find((s) => s.id === inv.siteId), inv.sections, out)
  if (inv.dueAt && inv.issuedAt && inv.dueAt < inv.issuedAt) out.push('The due date is before the issue date.')
  if (!db.settings.company?.accountNumber && !db.settings.company?.bsb) out.push('No bank details are set, so customers will not see how to pay.')
  return [...new Set(out)]
}
