import { uid } from './lib/id'
import { shrinkPhoto } from './lib/photos'
import type { Dispatch, SetStateAction } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { errMsg } from './lib/remote'
import { today } from './lib/dates'
import type { Actions } from './storeTypes'
import type { Db } from './types'

interface Deps {
  getDb: () => Db
  setDb: Dispatch<SetStateAction<Db>>
  sb: SupabaseClient
  companyId: () => Promise<string | null>
  reload: () => Promise<void>
  fail: (message: string) => void
}

type Result = { error: { message: string } | null }

// Supabase-backed store. Every change is written to the database; the app then re-reads everything with load_all(),
// so the screen always shows what the database holds. Rules (who may write, locked timesheets, required audits)
// are enforced by the database itself, and any rejection is shown to the user.
export function makeRemoteActions({ getDb, setDb, sb, companyId, reload, fail }: Deps): Actions {
  // run a write, refresh, resolve to an error message (or null)
  const write = async (fn: () => PromiseLike<Result>): Promise<string | null> => {
    try {
      const { error } = await fn()
      if (error) fail(error.message)
      await reload()
      return error ? error.message : null
    } catch (e) {
      const m = errMsg(e)
      fail(m)
      return m
    }
  }
  // like write, but for typing-speed edits: no refresh unless it failed
  const quiet = async (fn: () => PromiseLike<Result>) => {
    try {
      const { error } = await fn()
      if (error) {
        fail(error.message)
        await reload()
      }
    } catch (e) {
      fail(errMsg(e))
    }
  }
  // call a database function that returns a value, then refresh
  const call = async <T,>(name: string, args?: Record<string, unknown>): Promise<T | null> => {
    try {
      const { data, error } = await sb.rpc(name, args)
      if (error) fail(error.message)
      await reload()
      return error ? null : (data as T)
    } catch (e) {
      fail(errMsg(e))
      return null
    }
  }
  const num = (v: number | null) => (v == null ? 0 : Number(v))

  return {
    addCustomer: async (c) => {
      try {
        const { data, error } = await sb
          .from('customers')
          .insert({ name: c.name, contact_name: c.contactName, phone: c.phone, email: c.email, address: c.address, address_parts: c.addressParts ?? null, lat: c.lat ?? null, lng: c.lng ?? null, on_hold: c.onHold })
          .select('id')
          .single()
        if (error) {
          fail(error.message)
          return null
        }
        await reload()
        return data.id as string
      } catch (e) {
        fail(errMsg(e))
        return null
      }
    },
    updateCustomer: (c) => {
      setDb((d) => ({ ...d, customers: d.customers.map((x) => (x.id === c.id ? c : x)) }))
      void write(() => sb.from('customers').update({ name: c.name, contact_name: c.contactName, phone: c.phone, email: c.email, address: c.address, address_parts: c.addressParts ?? null, lat: c.lat ?? null, lng: c.lng ?? null, on_hold: c.onHold }).eq('id', c.id))
    },
    deleteCustomer: (id) => {
      void write(() => sb.from('customers').delete().eq('id', id))
    },
    deleteSite: (id) => {
      void write(() => sb.from('sites').delete().eq('id', id))
    },
    updateSite: (s) => {
      setDb((d) => ({ ...d, sites: d.sites.map((x) => (x.id === s.id ? s : x)) }))
      void write(() => sb.from('sites').update({ customer_id: s.customerId, name: s.name, address: s.address, address_parts: s.addressParts ?? null, lat: s.lat ?? null, lng: s.lng ?? null, property_type: s.propertyType ?? '', access_notes: s.accessNotes ?? '' }).eq('id', s.id))
    },
    addSite: (s) => {
      void write(() => sb.from('sites').insert({ customer_id: s.customerId, name: s.name, address: s.address, address_parts: s.addressParts ?? null, lat: s.lat ?? null, lng: s.lng ?? null, property_type: s.propertyType ?? '', access_notes: s.accessNotes ?? '' }))
    },
    upsertPart: (p) => {
      const row = { part_no: p.partNo, description: p.description, vendor: p.vendor, category: p.category, cost: p.cost, markup_pct: p.markupPct, stock: p.stock }
      void write(() => (p.id ? sb.from('catalog_parts').update(row).eq('id', p.id) : sb.from('catalog_parts').insert(row)))
    },
    deletePart: (id) => {
      void write(() => sb.from('catalog_parts').delete().eq('id', id))
    },
    createQuote: async (customerId, siteId, name) =>
      num(await call<number>('create_quote', { p_customer_id: customerId, p_site_id: siteId, p_name: name })),
    saveQuote: (q) => {
      void write(() => sb.rpc('save_quote', { p: q }))
    },
    fillQuote: async (id, fill) => {
      const q = getDb().quotes.find((x) => x.id === id)
      if (!q) return fail('Could not find the new quote.')
      const next = {
        ...q,
        description: fill.description,
        costCenters: [{ ...(q.costCenters[0] ?? { id: uid(), name: 'General' }), items: fill.items }, ...q.costCenters.slice(1)],
        timeline: [{ id: uid(), type: 'System' as const, message: 'Items drafted with AI and reviewed', at: new Date().toISOString() }, ...q.timeline],
      }
      setDb((d) => ({ ...d, quotes: d.quotes.map((x) => (x.id === id ? next : x)) }))
      await write(() => sb.rpc('save_quote', { p: next }))
    },
    deleteQuote: (id) => {
      void write(() => sb.from('quotes').delete().eq('id', id))
    },
    deleteJob: (id) => {
      const paths = getDb().jobPhotos.filter((p) => p.jobId === id && p.path).map((p) => p.path as string)
      void write(async () => {
        if (paths.length) await sb.storage.from('job-photos').remove(paths) // tidy the files; the rows go with the job
        return sb.from('jobs').delete().eq('id', id)
      })
    },
    createJobFromQuote: async (quoteId) => num(await call<number>('create_job_from_quote', { p_quote_id: quoteId })),
    addJobNote: (jobId, text, author) => {
      void write(() => sb.from('job_notes').insert({ job_id: jobId, text, author }))
    },
    addJobPhoto: async (jobId, file, author) => {
      try {
        const cid = await companyId()
        if (!cid) return 'Not signed in.'
        const blob = await shrinkPhoto(file)
        const path = `${cid}/${jobId}/${uid()}.jpg`
        const up = await sb.storage.from('job-photos').upload(path, blob, { contentType: 'image/jpeg' })
        if (up.error) return up.error.message
        const ins = await sb.from('job_photos').insert({ job_id: jobId, path, name: file.name, author })
        if (ins.error) return ins.error.message
        await reload()
        return null
      } catch (e) {
        return errMsg(e)
      }
    },
    deleteJobPhoto: (id) => {
      const ph = getDb().jobPhotos.find((p) => p.id === id)
      setDb((d) => ({ ...d, jobPhotos: d.jobPhotos.filter((p) => p.id !== id) }))
      void write(async () => {
        if (ph?.path) await sb.storage.from('job-photos').remove([ph.path])
        return sb.from('job_photos').delete().eq('id', id)
      })
    },
    photoUrls: async (photos) => {
      const paths = photos.filter((p) => p.path).map((p) => p.path as string)
      if (paths.length === 0) return {}
      const { data } = await sb.storage.from('job-photos').createSignedUrls(paths, 3600)
      const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]))
      return Object.fromEntries(photos.flatMap((p) => (p.path && byPath.get(p.path) ? [[p.id, byPath.get(p.path) as string]] : [])))
    },
    addAsset: (a) => {
      void write(async () => {
        const cid = await companyId()
        return sb.from('assets').insert({ company_id: cid, customer_id: a.customerId, site_id: a.siteId || null, name: a.name, category: a.category, make: a.make, model: a.model, serial: a.serial, location: a.location, install_date: a.installDate || null, warranty_until: a.warrantyUntil || null, interval_months: a.intervalMonths || null, last_serviced: a.lastServiced || null, next_due: a.nextDue || null, notes: a.notes, active: a.active })
      })
    },
    updateAsset: (a) => {
      setDb((d) => ({ ...d, assets: d.assets.map((x) => (x.id === a.id ? a : x)) }))
      void write(() => sb.from('assets').update({ customer_id: a.customerId, site_id: a.siteId || null, name: a.name, category: a.category, make: a.make, model: a.model, serial: a.serial, location: a.location, install_date: a.installDate || null, warranty_until: a.warrantyUntil || null, interval_months: a.intervalMonths || null, last_serviced: a.lastServiced || null, next_due: a.nextDue || null, notes: a.notes, active: a.active }).eq('id', a.id))
    },
    deleteAsset: (id) => {
      setDb((d) => ({ ...d, assets: d.assets.filter((x) => x.id !== id) }))
      void write(() => sb.from('assets').delete().eq('id', id))
    },
    logAssetService: (assetId, date, notes, by, jobId) => {
      void write(() => sb.rpc('log_asset_service', { p_asset: assetId, p_date: date, p_notes: notes, p_job: jobId ?? null, p_by: by }))
    },
    clockOn: (jobId, employeeId) => {
      if (getDb().clock.some((c) => c.jobId === jobId && c.employeeId === employeeId && !c.end)) return
      void write(() => sb.from('clock_entries').insert({ job_id: jobId, employee_id: employeeId }))
    },
    clockOff: (jobId, employeeId) => {
      void write(() => sb.from('clock_entries').update({ ended_at: new Date().toISOString() }).eq('job_id', jobId).eq('employee_id', employeeId).is('ended_at', null))
    },
    setJobStatus: (jobId, status) => {
      setDb((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, status } : j)) }))
      void write(() => sb.from('jobs').update({ status }).eq('id', jobId))
    },
    createInvoiceFromJob: async (jobId) => num(await call<number>('create_invoice_from_job', { p_job_id: jobId })),
    createProgressClaim: async (jobId, label, pct) => {
      try { return { id: num(await call<number>('create_progress_claim', { p_job_id: jobId, p_label: label, p_pct: pct })) } } catch (e) { return { error: e instanceof Error ? e.message : 'Could not create the claim.' } }
    },
    saveInvoice: (inv) => {
      setDb((d) => ({ ...d, invoices: d.invoices.map((x) => (x.id === inv.id ? inv : x)) }))
      void write(() =>
        sb.from('invoices').update({
          stage: inv.stage, due_at: inv.dueAt, notes: inv.notes ?? '', voided: inv.voided,
          retainage_pct: inv.retainagePct ?? 0, retainage_released: !!inv.retainageReleased,
        }).eq('id', inv.id),
      )
    },
    recordPayment: (invoiceId, p) => {
      void write(() => sb.from('payments').insert({ invoice_id: invoiceId, amount: p.amount, date: p.date, method: p.method }))
    },
    addScheduleEntry: async (e) => {
      if (!(e.start < e.end)) return 'End time must be after start time.'
      return write(() => sb.from('schedule_entries').insert({ job_id: e.jobId, employee_id: e.employeeId, date: e.date, start_time: e.start, end_time: e.end }))
    },
    deleteScheduleEntry: (id) => write(() => sb.from('schedule_entries').delete().eq('id', id)),
    setTimesheetLock: (on, until) => {
      setDb((d) => ({ ...d, timesheetLock: { on, until } }))
      void (async () => {
        const cid = await companyId()
        if (!cid) return fail('Could not find your company.')
        await write(() => sb.from('companies').update({ timesheet_lock_on: on, timesheet_lock_until: until || null }).eq('id', cid))
      })()
    },
    addReminder: (text) => {
      void write(() => sb.from('reminders').insert({ text }))
    },
    toggleReminder: (id) => {
      const cur = getDb().reminders.find((r) => r.id === id)
      if (!cur) return
      const done = !cur.done
      setDb((d) => ({ ...d, reminders: d.reminders.map((r) => (r.id === id ? { ...r, done } : r)) }))
      void write(() => sb.from('reminders').update({ done }).eq('id', id))
    },
    snoozeReminder: (id, until) => {
      setDb((d) => ({ ...d, reminders: d.reminders.map((r) => (r.id === id ? { ...r, snoozedUntil: until } : r)) }))
      void write(() => sb.from('reminders').update({ snoozed_until: until }).eq('id', id))
    },
    upsertAudit: (a) => {
      void write(() => sb.rpc('save_audit', { p: a }))
    },
    deleteAudit: (id) => {
      void write(() => sb.from('audits').delete().eq('id', id))
    },
    saveAuditResult: (r) => {
      void write(() => sb.from('audit_results').insert({ audit_id: r.auditId, audit_name: r.auditName, job_id: r.jobId, snapshot: r.snapshot, answers: r.answers }))
    },
    upsertPreBuild: (p) => {
      void write(() => sb.rpc('save_pre_build', { p }))
    },
    createPO: async (vendor, lines) => num(await call<number>('create_po', { p_vendor: vendor, p_lines: lines })),
    setPOStatus: (id, status) => {
      void write(() => sb.from('purchase_orders').update({ status }).eq('id', id))
    },
    receivePO: (id, received) => {
      void write(() => sb.rpc('receive_po', { p_po_id: id, p_received: received }))
    },
    createCount: async () => (await call<string>('create_inventory_count')) ?? '',
    setCountLine: (countId, partId, counted) => {
      setDb((d) => ({
        ...d,
        counts: d.counts.map((c) =>
          c.id === countId && !c.applied ? { ...c, lines: c.lines.map((l) => (l.partId === partId ? { ...l, counted } : l)) } : c,
        ),
      }))
      void quiet(() => sb.from('inventory_count_lines').update({ counted }).eq('count_id', countId).eq('part_id', partId))
    },
    applyCount: (countId) => {
      void write(() => sb.rpc('apply_inventory_count', { p_count_id: countId }))
    },
    addCredit: (invoiceId, amount, reason) => {
      void write(() => sb.from('credits').insert({ invoice_id: invoiceId, amount, reason, date: today() }))
    },
    addLead: (l) => {
      void write(() => sb.from('leads').insert({ name: l.name, contact_name: l.contactName, phone: l.phone, email: l.email, address: l.address, source: l.source, notes: l.notes }))
    },
    updateLead: (l) => {
      setDb((d) => ({ ...d, leads: d.leads.map((x) => (x.id === l.id ? l : x)) }))
      void write(() =>
        sb.from('leads').update({ name: l.name, contact_name: l.contactName, phone: l.phone, email: l.email, address: l.address, source: l.source, status: l.status, notes: l.notes }).eq('id', l.id),
      )
    },
    convertLead: async (leadId) => num(await call<number>('convert_lead', { p_lead_id: leadId })),
    createVendorQuote: async (vendor, validUntil, lines) => num(await call<number>('save_vendor_quote', { p: { vendor, validUntil, lines } })),
    saveVendorQuote: (q) => {
      void write(() => sb.rpc('save_vendor_quote', { p: q }))
    },
    acceptVendorQuote: async (id) => num(await call<number>('accept_vendor_quote', { p_id: id })),
    updateSettings: (s) => {
      setDb((d) => ({ ...d, settings: s }))
      void (async () => {
        const cid = await companyId()
        if (!cid) return fail('Could not find your company.')
        await write(() =>
          sb.from('companies').update({
            name: s.companyName, default_tax_rate: s.defaultTaxRate, payment_terms_days: s.paymentTermsDays,
            require_audits_to_complete: s.requireAuditsToComplete, invoice_footer: s.invoiceFooter, job_status_labels: s.jobStatusLabels, profile: s.company ?? {},
          }).eq('id', cid),
        )
      })()
    },
    addRecurring: (r) => {
      void write(() => sb.from('recurring_jobs').insert({ name: r.name, quote_id: r.quoteId, frequency: r.frequency, next_due: r.nextDue, active: r.active }))
    },
    deleteRecurring: (id) => {
      setDb((d) => ({ ...d, recurring: d.recurring.filter((x) => x.id !== id) }))
      void write(() => sb.from('recurring_jobs').delete().eq('id', id))
    },
    updateRecurring: (r) => {
      setDb((d) => ({ ...d, recurring: d.recurring.map((x) => (x.id === r.id ? r : x)) }))
      void write(() => sb.from('recurring_jobs').update({ name: r.name, quote_id: r.quoteId, frequency: r.frequency, next_due: r.nextDue, active: r.active }).eq('id', r.id))
    },
    runRecurring: async (ids) => num(await call<number>('run_recurring', { p_ids: ids })),
  }
}
