import { useState } from 'react'
import FilterBar from '../components/FilterBar'
import { useFilter, useStartOpen } from '../components/useFilter'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import AddressFields from '../components/AddressFields'
import type { AddressValue } from '../components/AddressFields'
import { emptyAddress, formatAddress, isBlank, normalizeParts, parseAddress, validateAddress } from '../lib/address'
import { exportCustomers } from '../lib/accounting'
import { money, computeCosting, STATUS_COLOR, STATUS_LABEL } from '../lib/costing'
import { usePaged } from '../components/Paged'

export function Soon() {
  const { slug } = useParams()
  return (
    <>
      <h1>{(slug ?? 'Page').replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}</h1>
      <p className="muted">Not built yet. This page is scheduled for a later milestone in the build plan.</p>
    </>
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type CForm = { name: string; contactName: string; phone: string; email: string; addr: AddressValue }
const emptyC: CForm = { name: '', contactName: '', phone: '', email: '', addr: { parts: emptyAddress, point: null } }

// existing records only have a one-line address, so split it for editing
const addrOf = (x: { address: string; addressParts?: import('../lib/address').AddressParts; lat?: number; lng?: number }): AddressValue => ({
  parts: normalizeParts(x.addressParts) ?? parseAddress(x.address),
  point: x.lat != null && x.lng != null ? { lat: x.lat, lng: x.lng } : null,
})
const addrFields = (a: AddressValue) => ({
  address: formatAddress(a.parts),
  addressParts: isBlank(a.parts) ? undefined : a.parts,
  lat: a.point?.lat,
  lng: a.point?.lng,
})

function CustomerForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: CForm; submitLabel: string; onSubmit: (f: CForm) => Promise<void> | void; onCancel: () => void
}) {
  const [f, setF] = useState(initial)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: 'name' | 'contactName' | 'phone' | 'email') => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) return setErr('Customer name is required.')
    if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) return setErr('Enter a valid email address.')
    const ae = validateAddress(f.addr.parts)
    if (ae) return setErr(ae)
    setErr(''); setBusy(true)
    try { await onSubmit({ ...f, name: f.name.trim(), email: f.email.trim() }) } finally { setBusy(false) }
  }
  return (
    <form className="card narrow" onSubmit={submit}>
      <label className="block">Customer name *<br /><input className="wide" value={f.name} onChange={set('name')} autoFocus /></label>
      <label className="block">Contact name<br /><input className="wide" value={f.contactName} onChange={set('contactName')} /></label>
      <label className="block">Phone<br /><input className="wide" type="tel" value={f.phone} onChange={set('phone')} /></label>
      <label className="block">Email<br /><input className="wide" type="email" value={f.email} onChange={set('email')} /></label>
      <AddressFields value={f.addr} onChange={(addr) => setF({ ...f, addr })} label="Address (Australia)" allowPoBox />
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

export function Customers() {
  const { db, addCustomer, canWrite } = useStore()
  const nav = useNavigate()
  const startOpen = useStartOpen()
  const [open, setOpen] = useState(startOpen)
  const hold = useFilter() === 'hold'
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = (hold ? db.customers.filter((c) => c.onHold) : db.customers)
    .filter((c) => !needle || `${c.name} ${c.contactName} ${c.phone} ${c.email} ${c.address}`.toLowerCase().includes(needle))
  const siteCount = new Map<string, number>()
  for (const s of db.sites) siteCount.set(s.customerId, (siteCount.get(s.customerId) ?? 0) + 1)
  const { shown, more } = usePaged(rows, `${hold}|${needle}`)
  return (
    <>
      <div className="row between"><h1>Customers ({db.customers.length})</h1><div className="row"><button onClick={() => exportCustomers(db.customers)}>Export CSV</button>{canWrite && <button onClick={() => setOpen(true)}>+ New customer</button>}</div></div>
      {open && (
        <CustomerForm
          initial={emptyC}
          submitLabel="Create customer"
          onCancel={() => setOpen(false)}
          onSubmit={async (f) => {
            const id = await addCustomer({ name: f.name, contactName: f.contactName, phone: f.phone, email: f.email, ...addrFields(f.addr), onHold: false })
            if (id) nav(`/customers/${id}`)
          }}
        />
      )}
      <FilterBar label="customers on hold" shown={rows.length} total={db.customers.length} />
      <input className="wide" placeholder="Search customers by name, contact, phone or address…" value={q} onChange={(e) => setQ(e.target.value)} />
      <table>
        <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Location</th><th>Sites</th><th>Status</th></tr></thead>
        <tbody>
          {shown.map((c) => (
            <tr key={c.id}>
              <td><Link to={`/customers/${c.id}`}>{c.name}</Link></td>
              <td>{c.contactName}</td>
              <td>{c.phone}</td>
              <td>{[c.addressParts?.suburb, c.addressParts?.state].filter(Boolean).join(' ') || c.address}</td>
              <td>{siteCount.get(c.id) ?? 0}</td>
              <td>{c.onHold ? 'On hold' : 'Active'}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="muted">No sites match.</td></tr>}
        </tbody>
      </table>
      {more}
    </>
  )
}

function SiteForm({ customers, fixedCustomerId, initial, submitLabel = 'Add site', onSubmit, onCancel }: {
  customers: { id: string; name: string }[]; fixedCustomerId?: string
  initial?: { customerId: string; name: string; addr: AddressValue; propertyType?: string; accessNotes?: string }; submitLabel?: string
  onSubmit: (customerId: string, name: string, addr: AddressValue, extra: { propertyType: string; accessNotes: string }) => void; onCancel: () => void
}) {
  const [customerId, setCustomerId] = useState(initial?.customerId ?? fixedCustomerId ?? customers[0]?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [addr, setAddr] = useState<AddressValue>(initial?.addr ?? { parts: emptyAddress, point: null })
  const [propertyType, setPropertyType] = useState(initial?.propertyType ?? '')
  const [accessNotes, setAccessNotes] = useState(initial?.accessNotes ?? '')
  const [err, setErr] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId) return setErr('Choose a customer.')
    if (!name.trim()) return setErr('Site name is required.')
    const ae = validateAddress(addr.parts)
    if (ae) return setErr(ae)
    if (!isBlank(addr.parts) && !addr.point && !confirm('This site has no map location, so it will not appear on the dashboard map. Save anyway? (Use "Find on map" first.)')) return
    onSubmit(customerId, name.trim(), addr, { propertyType, accessNotes: accessNotes.trim() })
  }
  return (
    <form className="card narrow" onSubmit={submit}>
      {!fixedCustomerId && (
        <label className="block">Customer *<br />
          <select className="wide" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <label className="block">Site name *<br /><input className="wide" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      <label className="block">Property type<br />
        <select className="wide" value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
          <option value="">Not set</option>
          {['Residential', 'Commercial', 'Industrial', 'Retail', 'Strata / body corporate', 'Rural', 'Government / education'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <AddressFields value={addr} onChange={setAddr} label="Site address (Australia)" />
      <label className="block">Access &amp; site notes<br />
        <textarea rows={3} value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} placeholder="Gate or door codes, parking, induction, site contact, working hours, hazards" />
      </label>
      {err && <p className="error">{err}</p>}
      <div className="row"><button type="submit" className="primary">{submitLabel}</button><button type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  )
}

export function QuoteForm({ customers, sites, fixedCustomerId, onSubmit, onCancel }: {
  customers: { id: string; name: string }[]
  sites: { id: string; customerId: string; name: string }[]
  fixedCustomerId?: string
  onSubmit: (customerId: string, siteId: string, name: string) => Promise<void> | void
  onCancel: () => void
}) {
  const [customerId, setCustomerId] = useState(fixedCustomerId ?? customers[0]?.id ?? '')
  const mine = sites.filter((s) => s.customerId === customerId)
  const [siteId, setSiteId] = useState(mine[0]?.id ?? '')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const pickCustomer = (id: string) => { setCustomerId(id); setSiteId(sites.find((s) => s.customerId === id)?.id ?? '') }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId) return setErr('Choose a customer.')
    if (!siteId) return setErr('This customer has no site yet. Add a site first.')
    if (!name.trim()) return setErr('Quote name is required.')
    await onSubmit(customerId, siteId, name.trim())
  }
  return (
    <form className="card narrow" onSubmit={submit}>
      {!fixedCustomerId && (
        <label className="block">Customer *<br />
          <select className="wide" value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <label className="block">Site *<br />
        <select className="wide" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          {mine.length === 0 && <option value="">No sites for this customer</option>}
          {mine.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="block">Quote name *<br /><input className="wide" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      {err && <p className="error">{err}</p>}
      <div className="row"><button type="submit" className="primary">Create quote</button><button type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  )
}

export function CustomerDetail() {
  const { id } = useParams()
  const { db, addSite, updateSite, deleteSite, deleteCustomer, updateCustomer, createQuote, canWrite } = useStore()
  const nav = useNavigate()
  const [editing, setEditing] = useState(false)
  const [addingSite, setAddingSite] = useState(false)
  const [addingQuote, setAddingQuote] = useState(false)
  const [editingSite, setEditingSite] = useState<(typeof db.sites)[number] | null>(null)
  const c = db.customers.find((x) => x.id === id)
  if (!c) return <p>Customer not found.</p>
  const sites = db.sites.filter((s) => s.customerId === c.id)
  const quotes = db.quotes.filter((q) => q.customerId === c.id)
  const hasHistory = quotes.length > 0 || db.jobs.some((j) => j.customerId === c.id) || db.invoices.some((i) => i.customerId === c.id)
  return (
    <>
      <div className="row between">
        <h1>{c.name}</h1>
        <Link className="btn" to={`/customers/${c.id}/statement`}>Statement</Link>
        <label><input type="checkbox" disabled={!canWrite} checked={c.onHold} onChange={(e) => updateCustomer({ ...c, onHold: e.target.checked })} /> On hold</label>
      </div>
      <div className="grid2">
        {editing ? (
          <CustomerForm
            initial={{ name: c.name, contactName: c.contactName, phone: c.phone, email: c.email, addr: addrOf(c) }}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={(f) => { updateCustomer({ ...c, name: f.name, contactName: f.contactName, phone: f.phone, email: f.email, ...addrFields(f.addr) }); setEditing(false) }}
          />
        ) : (
          <div className="card">
            <div className="row between"><h3>Contact</h3>{canWrite && <button onClick={() => setEditing(true)}>Edit</button>}</div>
            <p>{c.contactName || <span className="muted">No contact name</span>}<br />{c.phone}<br />{c.email}<br />{c.address}{c.lat != null && <><br /><span className="muted">📍 mapped</span></>}</p>
          </div>
        )}
        <div className="card">
          <div className="row between"><h3>Sites</h3>
            {canWrite && <button onClick={() => setAddingSite(true)}>+ Add</button>}
          </div>
          {addingSite && (
            <SiteForm
              customers={[c]}
              fixedCustomerId={c.id}
              onCancel={() => setAddingSite(false)}
              onSubmit={(cid, name, addr, x) => { addSite({ customerId: cid, name, ...addrFields(addr), ...x }); setAddingSite(false) }}
            />
          )}
          {editingSite && (
            <SiteForm
              customers={[c]}
              fixedCustomerId={c.id}
              submitLabel="Save site"
              initial={{ customerId: c.id, name: editingSite.name, addr: addrOf(editingSite), propertyType: editingSite.propertyType, accessNotes: editingSite.accessNotes }}
              onCancel={() => setEditingSite(null)}
              onSubmit={(cid, name, addr, x) => { updateSite({ ...editingSite, customerId: cid, name, ...addrFields(addr), ...x }); setEditingSite(null) }}
            />
          )}
          <ul>{sites.map((s) => {
            const used = db.quotes.some((q) => q.siteId === s.id) || db.jobs.some((j) => j.siteId === s.id) || db.invoices.some((i) => i.siteId === s.id)
            return (
              <li key={s.id}>{s.name} <span className="muted">{s.address}</span>{s.propertyType && <span className="pill" style={{ marginLeft: 6, fontSize: '.7rem', padding: '1px 8px' }}>{s.propertyType}</span>} <span title={s.lat != null ? 'Shown on the map' : 'No map location yet. Edit the site and use Find on map.'}>{s.lat != null ? '📍' : '⚠️'}</span>{' '}
                {canWrite && <button className="link-btn" onClick={() => { setEditingSite(s); setAddingSite(false) }}>edit</button>}{' '}
                {canWrite && <button className="link-btn" disabled={used} title={used ? 'In use by a quote, job or invoice' : ''} onClick={() => confirm(`Delete site "${s.name}"?`) && deleteSite(s.id)}>delete</button>}
              </li>
            )
          })}</ul>
          {!sites.length && !addingSite && <p className="muted">No sites yet. Add one to create quotes.</p>}
        </div>
      </div>
      <div className="row between"><h3>Quotes</h3>
        {canWrite && <button disabled={!sites.length} onClick={() => setAddingQuote(true)}>+ New quote</button>}
      </div>
      {addingQuote && (
        <QuoteForm
          customers={[c]}
          sites={sites}
          fixedCustomerId={c.id}
          onCancel={() => setAddingQuote(false)}
          onSubmit={async (cid, sid, name) => { const qid = await createQuote(cid, sid, name); if (qid) nav(`/quotes/${qid}`) }}
        />
      )}
      {canWrite && (
        <p>
          <button
            disabled={hasHistory}
            title={hasHistory ? 'This customer has quotes, jobs or invoices, so it cannot be deleted. Put it on hold instead.' : ''}
            onClick={() => { if (confirm(`Delete customer "${c.name}" and its sites? This cannot be undone.`)) { deleteCustomer(c.id); nav('/customers') } }}
          >Delete customer</button>
        </p>
      )}
      <table>
        <thead><tr><th>#</th><th>Name</th><th>Status</th><th>Total</th></tr></thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id}>
              <td><Link to={`/quotes/${q.id}`}>{q.id}</Link></td><td>{q.name}</td>
              <td><i className="dot" style={{ background: STATUS_COLOR[q.status] }} />{STATUS_LABEL[q.status]}</td>
              <td>{money(computeCosting(q).total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function Sites() {
  const { db, addSite, canWrite } = useStore()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const custName = new Map(db.customers.map((c) => [c.id, c.name]))
  const rows = db.sites.filter((s) => !needle || `${s.name} ${s.address} ${s.propertyType ?? ''} ${custName.get(s.customerId) ?? ''}`.toLowerCase().includes(needle))
  const { shown, more } = usePaged(rows, needle)
  return (
    <>
      <div className="row between"><h1>Sites ({db.sites.length})</h1>
        {canWrite && <button disabled={!db.customers.length} onClick={() => setOpen(true)}>+ New site</button>}
      </div>
      {open && (
        <SiteForm
          customers={db.customers}
          onCancel={() => setOpen(false)}
          onSubmit={(customerId, name, addr, x) => { addSite({ customerId, name, ...addrFields(addr), ...x }); setOpen(false) }}
        />
      )}
      <input className="wide" placeholder="Search sites by name, address or customer…" value={q} onChange={(e) => setQ(e.target.value)} />
      <table>
        <thead><tr><th>Site</th><th>Customer</th><th>Type</th><th>Address</th><th>Map</th></tr></thead>
        <tbody>
          {shown.map((s) => (
            <tr key={s.id}><td>{s.name}</td><td><Link to={`/customers/${s.customerId}`}>{custName.get(s.customerId)}</Link></td><td>{s.propertyType}</td><td>{s.address}{s.accessNotes && <><br /><span className="muted">Access: {s.accessNotes}</span></>}</td><td>{s.lat != null ? '📍' : '⚠️ not mapped'}</td></tr>
          ))}
        </tbody>
      </table>
      {more}
    </>
  )
}
