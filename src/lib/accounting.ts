import { downloadCsv } from './csv'
import { invoiceTotals } from './invoicing'
import type { CatalogPart, Customer, Db } from '../types'

const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')

// Xero "Import sales invoices" layout: one row per line item, dates as DD/MM/YYYY.
// Account code 200 is Xero's default Sales account; change it in Xero after import if your chart differs.
export function exportXeroInvoices(db: Db) {
  const rows: (string | number)[][] = []
  for (const inv of db.invoices) {
    if (inv.voided || inv.stage === 'draft') continue
    const c = db.customers.find((x) => x.id === inv.customerId)
    const job = db.jobs.find((j) => j.id === inv.jobId)
    const taxType = inv.taxRate > 0 ? 'GST on Income' : 'GST Free Income'
    for (const s of inv.sections) {
      for (const i of s.items) {
        rows.push([c?.name ?? '', c?.email ?? '', `INV-${inv.id}`, job?.name ?? '', dmy(inv.issuedAt), dmy(inv.dueAt), i.description, i.quantity, i.unitSell.toFixed(2), 200, taxType])
      }
    }
    if (inv.discount > 0) rows.push([c?.name ?? '', c?.email ?? '', `INV-${inv.id}`, job?.name ?? '', dmy(inv.issuedAt), dmy(inv.dueAt), 'Discount', 1, (-inv.discount).toFixed(2), 200, taxType])
  }
  downloadCsv('xero-invoices.csv', ['*ContactName', 'EmailAddress', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate', '*Description', '*Quantity', '*UnitAmount', '*AccountCode', '*TaxType'], rows)
  return rows.length
}

export function exportCustomers(customers: Customer[]) {
  downloadCsv('customers.csv', ['Name', 'Contact', 'Phone', 'Email', 'Address', 'On hold'],
    customers.map((c) => [c.name, c.contactName, c.phone, c.email, c.address, c.onHold ? 'Yes' : 'No']))
}

export function exportParts(parts: CatalogPart[]) {
  downloadCsv('parts.csv', ['Part no', 'Description', 'Vendor', 'Category', 'Cost', 'Markup %', 'Stock'],
    parts.map((p) => [p.partNo, p.description, p.vendor, p.category, p.cost.toFixed(2), p.markupPct, p.stock]))
}

// total due across the exported invoices, handy as a reconciliation check
export const invoicesTotal = (db: Db) => db.invoices.filter((i) => !i.voided && i.stage !== 'draft').reduce((a, i) => a + invoiceTotals(i).total, 0)
