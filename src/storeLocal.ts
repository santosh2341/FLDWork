import { fmtDate, today } from './lib/dates'
import type { Dispatch, SetStateAction } from 'react'
import { withLog } from './lib/invoicing'
import { claimedPct, quoteNet } from './lib/claims'
import { advance } from './lib/recurring'
import { uid } from './lib/id'
import { addMonths } from './lib/assets'
import { blobToDataUrl, shrinkPhoto } from './lib/photos'
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
    fillQuote: async (id, fill) => setDb((d) => ({ ...d, quotes: d.quotes.map((q) => (q.id === id ? { ...q, description: fill.description, costCenters: [{ ...(q.costCenters[0] ?? { id: uid(), name: 'General' }), items: fill.items }, ...q.costCenters.slice(1)], timeline: [{ id: uid(), type: 'System', message: 'Items drafted with AI and reviewed', at: new Date().toISOString() }, ...q.timeline] } : q)) })),
    deleteQuote: (id) => setDb((d) => ({ ...d, quotes: d.quotes.filter((q) => q.id !== id), leads: d.leads.map((l) => (l.quoteId === id ? { ...l, quoteId: undefined } : l)), recurring: d.recurring.filter((r) => r.quoteId !== id) })),
    deleteJob: (id) => setDb((d) => ({ ...d, jobs: d.jobs.filter((j) => j.id !== id), schedule: d.schedule.filter((e) => e.jobId !== id), auditResults: d.auditResults.filter((r) => r.jobId !== id), jobPhotos: d.jobPhotos.filter((p) => p.jobId !== id), jobNotes: d.jobNotes.filter((n) => n.jobId !== id), jobCosts: d.jobCosts.filter((n) => n.jobId !== id), clock: d.clock.filter((c) => c.jobId !== id) })),
    addJobCost: (c) => setDb((d) => ({ ...d, jobCosts: [{ ...c, id: uid() }, ...d.jobCosts] })),
    deleteJobCost: (id) => setDb((d) => ({ ...d, jobCosts: d.jobCosts.filter((x) => x.id !== id) })),
    createQuoteLink: async (quoteId, by) => {
      if (!db.quotes.some((q) => q.id === quoteId)) return { error: 'Quote not found.' }
      const bytes = crypto.getRandomValues(new Uint8Array(32))
      const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      const now = new Date()
      const expires = new Date(now.getTime() + 60 * 86400000)
      setDb((d) => ({
        ...d,
        quoteLinks: [{ token, quoteId, createdAt: now.toISOString(), createdBy: by, expiresAt: expires.toISOString(), viewCount: 0 }, ...(d.quoteLinks ?? [])],
        quotes: d.quotes.map((q) => (q.id !== quoteId ? q : {
          ...q,
          status: q.status === 'to_be_completed' ? 'sent' : q.status,
          updatedAt: now.toISOString(),
          timeline: [{ id: uid(), type: 'System', message: `Online acceptance link created${by ? ' by ' + by : ''}`, at: now.toISOString() }, ...q.timeline],
        })),
      }))
      return { token }
    },
    revokeQuoteLink: async (token) => {
      setDb((d) => ({ ...d, quoteLinks: (d.quoteLinks ?? []).map((l) => (l.token === token ? { ...l, revokedAt: new Date().toISOString() } : l)) }))
      return null
    },
    addJobNote: (jobId, text, author) => setDb((d) => ({ ...d, jobNotes: [{ id: uid(), jobId, author, text, at: new Date().toISOString() }, ...d.jobNotes] })),
    addJobPhoto: async (jobId, file, author) => {
      try {
        const dataUrl = await blobToDataUrl(await shrinkPhoto(file, 1000, 0.6))
        setDb((d) => ({ ...d, jobPhotos: [{ id: uid(), jobId, name: file.name, author, at: new Date().toISOString(), dataUrl }, ...d.jobPhotos] }))
        return null
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not add that photo.'
      }
    },
    deleteJobPhoto: (id) => setDb((d) => ({ ...d, jobPhotos: d.jobPhotos.filter((p) => p.id !== id) })),
    photoUrls: async (photos) => Object.fromEntries(photos.filter((p) => p.dataUrl).map((p) => [p.id, p.dataUrl as string])),
    addAsset: (a) => setDb((d) => ({ ...d, assets: [...d.assets, { ...a, id: uid(), services: [] }] })),
    updateAsset: (a) => setDb((d) => ({ ...d, assets: d.assets.map((x) => (x.id === a.id ? a : x)) })),
    deleteAsset: (id) => setDb((d) => ({ ...d, assets: d.assets.filter((x) => x.id !== id) })),
    logAssetService: (assetId, date, notes, by, jobId) =>
      setDb((d) => ({
        ...d,
        assets: d.assets.map((a) => {
          if (a.id !== assetId) return a
          const last = !a.lastServiced || date > a.lastServiced ? date : a.lastServiced
          return { ...a, lastServiced: last, nextDue: a.intervalMonths ? addMonths(last, a.intervalMonths) : a.nextDue, services: [{ id: uid(), jobId, date, notes, by }, ...a.services] }
        }),
      })),
    clockOn: (jobId, employeeId) => setDb((d) => (d.clock.some((c) => c.jobId === jobId && c.employeeId === employeeId && !c.end) ? d : { ...d, clock: [{ id: uid(), jobId, employeeId, start: new Date().toISOString() }, ...d.clock] })),
    clockOff: (jobId, employeeId) => setDb((d) => ({ ...d, clock: d.clock.map((c) => (c.jobId === jobId && c.employeeId === employeeId && !c.end ? { ...c, end: new Date().toISOString() } : c)) })),
    setClockApproved: async (ids, approved, by) => {
      const at = approved ? new Date().toISOString() : null
      setDb((d) => ({ ...d, clock: d.clock.map((c) => (ids.includes(c.id) ? { ...c, approvedAt: at, approvedBy: approved ? by : '' } : c)) }))
      return null
    },
    setEmployeeRate: async (employeeId, rate) => {
      if (rate != null && !(rate >= 0)) return 'Enter an hourly cost of zero or more.'
      setDb((d) => ({ ...d, employees: d.employees.map((e) => (e.id === employeeId ? { ...e, costRate: rate } : e)) }))
      return null
    },
    setJobStatus: (jobId, status) => setDb((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, status } : j)) })),
    createInvoiceFromJob: async (jobId) => {
      const existing = db.invoices.find((i) => i.jobId === jobId && !i.voided && i.claimPct == null)
      if (!existing && claimedPct(db.invoices, jobId) > 0) return 0
      if (existing) return existing.id
      const job = db.jobs.find((j) => j.id === jobId)
      const q = job && db.quotes.find((x) => x.id === job.quoteId)
      if (!job || !q) return 0
      const id = Math.max(1700, ...db.invoices.map((i) => i.id)) + 1
      const issued = new Date()
      const due = new Date(issued.getTime() + db.settings.paymentTermsDays * 86400000)
      const inv: Invoice = {
        id, jobId, customerId: job.customerId, siteId: job.siteId,
        issuedAt: fmtDate(issued), dueAt: fmtDate(due), stage: 'draft',
        sections: JSON.parse(JSON.stringify(q.costCenters)), taxRate: q.taxRate, discount: q.discount, payments: [], voided: false,
      }
      setDb((d) => ({ ...d, invoices: [inv, ...d.invoices], jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, status: 'invoiced' } : j)) }))
      return id
    },
    createProgressClaim: async (jobId, label, pct) => {
      const job = db.jobs.find((j) => j.id === jobId)
      const q = job && db.quotes.find((x) => x.id === job.quoteId)
      if (!job || !q) return { error: 'Job not found.' }
      if (!(pct > 0 && pct <= 100)) return { error: 'Claim percentage must be between 1 and 100.' }
      if (db.invoices.some((i) => i.jobId === jobId && !i.voided && i.claimPct == null)) return { error: 'This job already has a full invoice.' }
      const done = claimedPct(db.invoices, jobId)
      if (done + pct > 100.0001) return { error: `Only ${Math.round((100 - done) * 100) / 100} percent is left to claim on this job.` }
      const id = Math.max(1700, ...db.invoices.map((i) => i.id)) + 1
      const issued = new Date()
      const due = new Date(issued.getTime() + db.settings.paymentTermsDays * 86400000)
      const name = label.trim() || 'Progress claim'
      const inv: Invoice = {
        id, jobId, customerId: job.customerId, siteId: job.siteId,
        issuedAt: fmtDate(issued), dueAt: fmtDate(due), stage: 'draft',
        sections: [{ id: uid(), name: 'Progress claim', items: [{ id: uid(), kind: 'part', description: `${name} – ${pct}% of quote ${q.id}`, quantity: 1, unitCost: 0, unitSell: Math.round(quoteNet(q) * pct) / 100 }] }],
        taxRate: q.taxRate, discount: 0, payments: [], voided: false, claimLabel: name, claimPct: pct,
      }
      const complete = done + pct >= 99.9999
      setDb((d) => ({ ...d, invoices: [inv, ...d.invoices], jobs: complete ? d.jobs.map((j) => (j.id === jobId ? { ...j, status: 'invoiced' } : j)) : d.jobs }))
      return { id }
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
    moveScheduleEntry: async (id, to) => {
      const e = db.schedule.find((x) => x.id === id)
      if (!e) return 'That visit no longer exists.'
      const start = to.start ?? e.start, end = to.end ?? e.end
      if (!(start < end)) return 'End time must be after start time.'
      const lock = db.timesheetLock
      if (lock.on && lock.until && (e.date <= lock.until || to.date <= lock.until)) return `Timesheets are locked up to ${lock.until}.`
      setDb((d) => ({ ...d, schedule: d.schedule.map((x) => (x.id === id ? { ...x, date: to.date, employeeId: to.employeeId, start, end } : x)) }))
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
    createPO: async (vendor, lines, jobId) => {
      const id = Math.max(5000, ...db.purchaseOrders.map((p) => p.id)) + 1
      setDb((d) => ({
        ...d,
        purchaseOrders: [
          { id, vendor, status: 'draft', createdAt: today(), jobId: jobId ?? null, lines: lines.map((l) => ({ ...l, id: uid(), received: 0 })) },
          ...d.purchaseOrders,
        ],
      }))
      return id
    },
    setPOJob: async (id, jobId) => {
      if (jobId != null && !db.jobs.some((j) => j.id === jobId)) return 'That job does not exist.'
      setDb((d) => ({ ...d, purchaseOrders: d.purchaseOrders.map((p) => (p.id === id ? { ...p, jobId } : p)) }))
      return null
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
            if (po.jobId == null) stockAdd[l.partId] = (stockAdd[l.partId] ?? 0) + n
            got.push({ partId: l.partId, qty: n, unitCost: l.unitCost })
          }
          return { ...l, received: l.received + n }
        })
        const done = lines.every((l) => l.received >= l.qty)
        const rid = Math.max(6000, ...d.receipts.map((r) => r.id)) + 1
        const posted = got.length > 0 && po.jobId != null
          ? [{ id: uid(), jobId: po.jobId, date: today(), kind: 'material' as const, supplier: po.vendor, description: `Received on PO ${id} (receipt R-${rid})`, amount: got.reduce((a, l) => a + l.qty * l.unitCost, 0), receiptId: rid }]
          : []
        return {
          ...d,
          receipts: got.length > 0 ? [{ id: rid, poId: id, date: today(), lines: got }, ...d.receipts] : d.receipts,
          jobCosts: [...posted, ...d.jobCosts],
          purchaseOrders: d.purchaseOrders.map((p) => (p.id === id ? { ...p, lines, status: done ? 'received' : p.status } : p)),
          catalog: d.catalog.map((c) => (stockAdd[c.id] ? { ...c, stock: c.stock + stockAdd[c.id] } : c)),
        }
      }),
    createCount: async () => {
      const id = uid()
      const c: InventoryCount = {
        id, date: today(), applied: false,
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
            ? withLog({ ...x, credits: [...(x.credits ?? []), { id: uid(), amount, reason, date: today() }] }, `Credit of ${amount.toFixed(2)} issued: ${reason}`)
            : x,
        ),
      })),
    addLead: (l) =>
      setDb((d) => ({ ...d, leads: [{ ...l, id: uid(), status: 'new', createdAt: today() }, ...d.leads] })),
    updateLead: (l) => setDb((d) => ({ ...d, leads: d.leads.map((x) => (x.id === l.id ? l : x)) })),
    createVendorQuote: async (vendor, validUntil, lines) => {
      const id = Math.max(7000, ...db.vendorQuotes.map((q) => q.id)) + 1
      const q: VendorQuote = {
        id, vendor, status: 'requested', createdAt: today(), validUntil,
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
          { id: poId, vendor: q.vendor, status: 'draft', createdAt: today(), lines: q.lines.map((l) => ({ id: uid(), partId: l.partId, qty: l.qty, unitCost: l.unitCost, received: 0 })) },
          ...d.purchaseOrders,
        ],
        vendorQuotes: d.vendorQuotes.map((x) => (x.id === id ? { ...x, status: 'accepted', poId } : x)),
      }))
      return poId
    },
    updateSettings: (s) => setDb((d) => ({ ...d, settings: s })),
    addRecurring: (r) => setDb((d) => ({ ...d, recurring: [...d.recurring, { ...r, id: uid() }] })),
    deleteRecurring: (id) => setDb((d) => ({ ...d, recurring: d.recurring.filter((x) => x.id !== id) })),
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
