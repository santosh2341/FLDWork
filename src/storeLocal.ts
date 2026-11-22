import type { Dispatch, SetStateAction } from 'react'
import { withLog } from './lib/invoicing'
import { advance } from './lib/recurring'
import { uid } from './lib/id'
import type { Actions } from './storeTypes'
import type { CatalogPart, Db, InventoryCount, Invoice, Job, Quote, Receipt, VendorQuote } from './types'

// Browser-only store: used when no Supabase keys are set. Data lives in the Db state (saved to localStorage by the provider).
export function makeLocalActions(db: Db, setDb: Dispatch<SetStateAction<Db>>): Actions {
  return {
    addCustomer: async (c) => {
      const id = uid()
      setDb((d) => ({ ...d, customers: [...d.customers, { ...c, id }] }))
      return id
    },
    updateCustomer: (c) => setDb((d) => ({ ...d, customers: d.customers.map((x) => (x.id === c.id ? c : x)) })),
    addSite: (s) => setDb((d) => ({ ...d, sites: [...d.sites, { ...s, id: uid() }] })),
    deleteCustomer: (id) => setDb((d) => ({ ...d, customers: d.customers.filter((c) => c.id !== id), sites: d.sites.filter((s) => s.customerId !== id) })),
    deleteSite: (id) => setDb((d) => ({ ...d, sites: d.sites.filter((s) => s.id !== id) })),
    updateSite: (s) => setDb((d) => ({ ...d, sites: d.sites.map((x) => (x.id === s.id ? s : x)) })),
    upsertPart: (p) =>
      setDb((d) => {
        if (p.id) return { ...d, catalog: d.catalog.map((x) => (x.id === p.id ? (p as CatalogPart) : x)) }
        return { ...d, catalog: [...d.catalog, { ...p, id: uid() } as CatalogPart] }
      }),
    deletePart: (id) => setDb((d) => ({ ...d, catalog: d.catalog.filter((x) => x.id !== id) })),
    createQuote: async (customerId, siteId, name) => {
      const id = Math.max(1000, ...db.quotes.map((q) => q.id)) + 1
      const now = new Date().toISOString()
      const q: Quote = {
        id, customerId, siteId, name, status: 'to_be_completed', description: '', notes: '', discount: 0, overheads: 0,
        taxRate: db.settings.defaultTaxRate, pricesLocked: false,
        costCenters: [{ id: uid(), name: 'General', items: [] }],
        timeline: [{ id: uid(), type: 'System', message: 'Quote created', at: now }],
        updatedAt: now,
      }
      setDb((d) => ({ ...d, quotes: [q, ...d.quotes] }))
      return id
    },
    saveQuote: (q) =>
      setDb((d) => ({ ...d, quotes: d.quotes.map((x) => (x.id === q.id ? { ...q, updatedAt: new Date().toISOString() } : x)) })),
    createJobFromQuote: async (quoteId) => {
      const existing = db.jobs.find((j) => j.quoteId === quoteId)
      if (existing) return existing.id
      const q = db.quotes.find((x) => x.id === quoteId)
      if (!q) return 0
      const id = Math.max(4000, ...db.jobs.map((j) => j.id)) + 1
      setDb((d) => ({
        ...d,
        jobs: [{ id, quoteId, customerId: q.customerId, siteId: q.siteId, name: q.name, status: 'pending', createdAt: new Date().toISOString() }, ...d.jobs],
      }))
      return id
    },
    setJobStatus: (jobId, status) => setDb((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, status } : j)) })),
    createInvoiceFromJob: async (jobId) => {
      const existing = db.invoices.find((i) => i.jobId === jobId && !i.voided)
      if (existing) return existing.id
      const job = db.jobs.find((j) => j.id === jobId)
      const q = job && db.quotes.find((x) => x.id === job.quoteId)
      if (!job || !q) return 0
      const id = Math.max(1700, ...db.invoices.map((i) => i.id)) + 1
      const issued = new Date()
      const due = new Date(issued.getTime() + db.settings.paymentTermsDays * 86400000)
      const inv: Invoice = {
        id, jobId, customerId: job.customerId, siteId: job.siteId,
        issuedAt: issued.toISOString().slice(0, 10), dueAt: due.toISOString().slice(0, 10), stage: 'draft',
        sections: JSON.parse(JSON.stringify(q.costCenters)), taxRate: q.taxRate, discount: q.discount, payments: [], voided: false,
      }
      setDb((d) => ({ ...d, invoices: [inv, ...d.invoices], jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, status: 'invoiced' } : j)) }))
      return id
    },
    saveInvoice: (inv) => setDb((d) => ({ ...d, invoices: d.invoices.map((x) => (x.id === inv.id ? inv : x)) })),
    recordPayment: (invoiceId, p) =>
      setDb((d) => ({
        ...d,
        invoices: d.invoices.map((x) =>
          x.id === invoiceId ? withLog({ ...x, payments: [...x.payments, { ...p, id: uid() }] }, `Payment of ${p.amount.toFixed(2)} recorded (${p.method})`) : x,
        ),
      })),
    addScheduleEntry: async (e) => {
      if (!(e.start < e.end)) return 'End time must be after start time.'
      if (db.timesheetLock.on && db.timesheetLock.until && e.date <= db.timesheetLock.until)
        return `Timesheets are locked up to ${db.timesheetLock.until}.`
      setDb((d) => ({
        ...d,
        schedule: [...d.schedule, { ...e, id: uid() }],
        jobs: d.jobs.map((j) => (j.id === e.jobId && j.status === 'pending' ? { ...j, status: 'scheduled' } : j)),
      }))
      return null
    },
    deleteScheduleEntry: async (id) => {
      const e = db.schedule.find((x) => x.id === id)
      if (e && db.timesheetLock.on && db.timesheetLock.until && e.date <= db.timesheetLock.until)
        return `Timesheets are locked up to ${db.timesheetLock.until}.`
      setDb((d) => ({ ...d, schedule: d.schedule.filter((x) => x.id !== id) }))
      return null
    },
    setTimesheetLock: (on, until) => setDb((d) => ({ ...d, timesheetLock: { on, until } })),
    addReminder: (text) => setDb((d) => ({ ...d, reminders: [...d.reminders, { id: uid(), text, done: false }] })),
    toggleReminder: (id) => setDb((d) => ({ ...d, reminders: d.reminders.map((r) => (r.id === id ? { ...r, done: !r.done } : r)) })),
    snoozeReminder: (id, until) => setDb((d) => ({ ...d, reminders: d.reminders.map((r) => (r.id === id ? { ...r, snoozedUntil: until } : r)) })),
    upsertAudit: (a) =>
      setDb((d) => ({ ...d, audits: d.audits.some((x) => x.id === a.id) ? d.audits.map((x) => (x.id === a.id ? a : x)) : [...d.audits, a] })),
    deleteAudit: (id) => setDb((d) => ({ ...d, audits: d.audits.filter((x) => x.id !== id) })),
    saveAuditResult: (r) =>
      setDb((d) => ({ ...d, auditResults: [{ ...r, id: uid(), completedAt: new Date().toISOString() }, ...d.auditResults] })),
    upsertPreBuild: (p) =>
      setDb((d) => ({ ...d, preBuilds: d.preBuilds.some((x) => x.id === p.id) ? d.preBuilds.map((x) => (x.id === p.id ? p : x)) : [...d.preBuilds, p] })),
    createPO: async (vendor, lines) => {
      const id = Math.max(5000, ...db.purchaseOrders.map((p) => p.id)) + 1
      setDb((d) => ({
        ...d,
        purchaseOrders: [
          { id, vendor, status: 'draft', createdAt: new Date().toISOString().slice(0, 10), lines: lines.map((l) => ({ ...l, id: uid(), received: 0 })) },
          ...d.purchaseOrders,
        ],
      }))
      return id
    },
    setPOStatus: (id, status) => setDb((d) => ({ ...d, purchaseOrders: d.purchaseOrders.map((p) => (p.id === id ? { ...p, status } : p)) })),
    receivePO: (id, received) =>
      setDb((d) => {
        const po = d.purchaseOrders.find((p) => p.id === id)
        if (!po) return d
        const stockAdd: Record<string, number> = {}
        const got: Receipt['lines'] = []
        const lines = po.lines.map((l) => {
          const n = Math.max(0, Math.min(received[l.id] ?? 0, l.qty - l.received))
          if (n > 0) {
            stockAdd[l.partId] = (stockAdd[l.partId] ?? 0) + n
            got.push({ partId: l.partId, qty: n, unitCost: l.unitCost })
          }
          return { ...l, received: l.received + n }
        })
        const done = lines.every((l) => l.received >= l.qty)
        return {
          ...d,
          receipts: got.length > 0 ? [{ id: Math.max(6000, ...d.receipts.map((r) => r.id)) + 1, poId: id, date: new Date().toISOString().slice(0, 10), lines: got }, ...d.receipts] : d.receipts,
          purchaseOrders: d.purchaseOrders.map((p) => (p.id === id ? { ...p, lines, status: done ? 'received' : p.status } : p)),
          catalog: d.catalog.map((c) => (stockAdd[c.id] ? { ...c, stock: c.stock + stockAdd[c.id] } : c)),
        }
      }),
    createCount: async () => {
      const id = uid()
      const c: InventoryCount = {
        id, date: new Date().toISOString().slice(0, 10), applied: false,
        lines: db.catalog.map((p) => ({ partId: p.id, expected: p.stock, counted: p.stock })),
      }
      setDb((d) => ({ ...d, counts: [c, ...d.counts] }))
      return id
    },
    setCountLine: (countId, partId, counted) =>
      setDb((d) => ({
        ...d,
        counts: d.counts.map((c) =>
          c.id === countId && !c.applied ? { ...c, lines: c.lines.map((l) => (l.partId === partId ? { ...l, counted } : l)) } : c,
        ),
      })),
    applyCount: (countId) =>
      setDb((d) => {
        const c = d.counts.find((x) => x.id === countId)
        if (!c || c.applied) return d
        const map = Object.fromEntries(c.lines.map((l) => [l.partId, l.counted]))
        return {
          ...d,
          counts: d.counts.map((x) => (x.id === countId ? { ...x, applied: true } : x)),
          catalog: d.catalog.map((p) => (p.id in map ? { ...p, stock: map[p.id] } : p)),
        }
      }),
    addCredit: (invoiceId, amount, reason) =>
      setDb((d) => ({
        ...d,
        invoices: d.invoices.map((x) =>
          x.id === invoiceId
            ? withLog({ ...x, credits: [...(x.credits ?? []), { id: uid(), amount, reason, date: new Date().toISOString().slice(0, 10) }] }, `Credit of ${amount.toFixed(2)} issued: ${reason}`)
            : x,
        ),
      })),
    addLead: (l) =>
      setDb((d) => ({ ...d, leads: [{ ...l, id: uid(), status: 'new', createdAt: new Date().toISOString().slice(0, 10) }, ...d.leads] })),
    updateLead: (l) => setDb((d) => ({ ...d, leads: d.leads.map((x) => (x.id === l.id ? l : x)) })),
    createVendorQuote: async (vendor, validUntil, lines) => {
      const id = Math.max(7000, ...db.vendorQuotes.map((q) => q.id)) + 1
      const q: VendorQuote = {
        id, vendor, status: 'requested', createdAt: new Date().toISOString().slice(0, 10), validUntil,
        lines: lines.map((l) => ({ ...l, id: uid() })),
      }
      setDb((d) => ({ ...d, vendorQuotes: [q, ...d.vendorQuotes] }))
      return id
    },
    saveVendorQuote: (q) => setDb((d) => ({ ...d, vendorQuotes: d.vendorQuotes.map((x) => (x.id === q.id ? q : x)) })),
    acceptVendorQuote: async (id) => {
      const q = db.vendorQuotes.find((x) => x.id === id)
      if (!q || q.status !== 'received') return 0
      const poId = Math.max(5000, ...db.purchaseOrders.map((p) => p.id)) + 1
      setDb((d) => ({
        ...d,
        purchaseOrders: [
          { id: poId, vendor: q.vendor, status: 'draft', createdAt: new Date().toISOString().slice(0, 10), lines: q.lines.map((l) => ({ id: uid(), partId: l.partId, qty: l.qty, unitCost: l.unitCost, received: 0 })) },
          ...d.purchaseOrders,
        ],
        vendorQuotes: d.vendorQuotes.map((x) => (x.id === id ? { ...x, status: 'accepted', poId } : x)),
      }))
      return poId
    },
    updateSettings: (s) => setDb((d) => ({ ...d, settings: s })),
    addRecurring: (r) => setDb((d) => ({ ...d, recurring: [...d.recurring, { ...r, id: uid() }] })),
    updateRecurring: (r) => setDb((d) => ({ ...d, recurring: d.recurring.map((x) => (x.id === r.id ? r : x)) })),
    runRecurring: async (ids) => {
      const targets = db.recurring.filter((r) => ids.includes(r.id) && r.active && db.quotes.some((q) => q.id === r.quoteId))
      if (targets.length === 0) return 0
      setDb((d) => {
        let nextId = Math.max(4000, ...d.jobs.map((j) => j.id))
        const created: Job[] = []
        const recurring = d.recurring.map((r) => {
          if (!ids.includes(r.id) || !r.active) return r
          const q = d.quotes.find((x) => x.id === r.quoteId)
          if (!q) return r
          nextId += 1
          created.push({ id: nextId, quoteId: q.id, customerId: q.customerId, siteId: q.siteId, name: `${r.name} (${r.nextDue})`, status: 'pending', createdAt: new Date().toISOString() })
          return { ...r, lastCreated: r.nextDue, nextDue: advance(r.nextDue, r.frequency) }
        })
        return { ...d, jobs: [...created.reverse(), ...d.jobs], recurring }
      })
      return targets.length
    },
    convertLead: async (leadId) => {
      const lead = db.leads.find((l) => l.id === leadId)
      if (!lead) return 0
      if (lead.quoteId) return lead.quoteId
      const cid = uid()
      const sid = uid()
      const qid = Math.max(1000, ...db.quotes.map((q) => q.id)) + 1
      const now = new Date().toISOString()
      const q: Quote = {
        id: qid, customerId: cid, siteId: sid, name: `Quote for ${lead.name}`, status: 'to_be_completed', description: lead.notes, notes: '',
        discount: 0, overheads: 0, taxRate: db.settings.defaultTaxRate, pricesLocked: false,
        costCenters: [{ id: uid(), name: 'General', items: [] }],
        timeline: [{ id: uid(), type: 'System', message: 'Quote created from lead', at: now }],
        updatedAt: now,
      }
      setDb((d) => ({
        ...d,
        customers: [...d.customers, { id: cid, name: lead.name, contactName: lead.contactName, phone: lead.phone, email: lead.email, address: lead.address, onHold: false }],
        sites: [...d.sites, { id: sid, customerId: cid, name: 'Main site', address: lead.address }],
        quotes: [q, ...d.quotes],
        leads: d.leads.map((l) => (l.id === leadId ? { ...l, status: 'converted', quoteId: qid } : l)),
      }))
      return qid
    },
  }
}
