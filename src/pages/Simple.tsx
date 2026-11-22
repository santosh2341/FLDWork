import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { money, computeCosting, STATUS_COLOR, STATUS_LABEL } from '../lib/costing'

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

type CForm = { name: string; contactName: string; phone: string; email: string; address: string }
const emptyC: CForm = { name: '', contactName: '', phone: '', email: '', address: '' }

function CustomerForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: CForm; submitLabel: string; onSubmit: (f: CForm) => Promise<void> | void; onCancel: () => void
}) {
  const [f, setF] = useState(initial)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof CForm) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) return setErr('Customer name is required.')
    if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) return setErr('Enter a valid email address.')
    setErr(''); setBusy(true)
    try { await onSubmit({ ...f, name: f.name.trim(), email: f.email.trim() }) } finally { setBusy(false) }
  }
  return (
    <form className="card narrow" onSubmit={submit}>
      <label className="block">Customer name *<br /><input className="wide" value={f.name} onChange={set('name')} autoFocus /></label>
      <label className="block">Contact name<br /><input className="wide" value={f.contactName} onChange={set('contactName')} /></label>
      <label className="block">Phone<br /><input className="wide" type="tel" value={f.phone} onChange={set('phone')} /></label>
      <label className="block">Email<br /><input className="wide" type="email" value={f.email} onChange={set('email')} /></label>
      <label className="block">Address<br /><input className="wide" value={f.address} onChange={set('address')} /></label>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

export function Customers() {
  const { db, addCustomer } = useStore()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="row between"><h1>Customers ({db.customers.length})</h1><button onClick={() => setOpen(true)}>+ New customer</button></div>
      {open && (
        <CustomerForm
          initial={emptyC}
          submitLabel="Create customer"
          onCancel={() => setOpen(false)}
          onSubmit={async (f) => {
            const id = await addCustomer({ ...f, onHold: false })
            if (id) nav(`/customers/${id}`)
          }}
        />
      )}
      <table>
        <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Sites</th><th>Status</th></tr></thead>
        <tbody>
          {db.customers.map((c) => (
            <tr key={c.id}>
              <td><Link to={`/customers/${c.id}`}>{c.name}</Link></td>
              <td>{c.contactName}</td>
              <td>{c.phone}</td>
              <td>{db.sites.filter((s) => s.customerId === c.id).length}</td>
              <td>{c.onHold ? 'On hold' : 'Active'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function SiteForm({ customers, fixedCustomerId, onSubmit, onCancel }: {
  customers: { id: string; name: string }[]; fixedCustomerId?: string
  onSubmit: (customerId: string, name: string, address: string) => void; onCancel: () => void
}) {
  const [customerId, setCustomerId] = useState(fixedCustomerId ?? customers[0]?.id ?? '')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [err, setErr] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId) return setErr('Choose a customer.')
    if (!name.trim()) return setErr('Site name is required.')
    onSubmit(customerId, name.trim(), address.trim())
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
      <label className="block">Address<br /><input className="wide" value={address} onChange={(e) => setAddress(e.target.value)} /></label>
      {err && <p className="error">{err}</p>}
      <div className="row"><button type="submit" className="primary">Add site</button><button type="button" onClick={onCancel}>Cancel</button></div>
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
  const { db, addSite, updateCustomer, createQuote } = useStore()
  const nav = useNavigate()
  const [editing, setEditing] = useState(false)
  const [addingSite, setAddingSite] = useState(false)
  const [addingQuote, setAddingQuote] = useState(false)
  const c = db.customers.find((x) => x.id === id)
  if (!c) return <p>Customer not found.</p>
  const sites = db.sites.filter((s) => s.customerId === c.id)
  const quotes = db.quotes.filter((q) => q.customerId === c.id)
  return (
    <>
      <div className="row between">
        <h1>{c.name}</h1>
        <label><input type="checkbox" checked={c.onHold} onChange={(e) => updateCustomer({ ...c, onHold: e.target.checked })} /> On hold</label>
      </div>
      <div className="grid2">
        {editing ? (
          <CustomerForm
            initial={{ name: c.name, contactName: c.contactName, phone: c.phone, email: c.email, address: c.address }}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={(f) => { updateCustomer({ ...c, ...f }); setEditing(false) }}
          />
        ) : (
          <div className="card">
            <div className="row between"><h3>Contact</h3><button onClick={() => setEditing(true)}>Edit</button></div>
            <p>{c.contactName || <span className="muted">No contact name</span>}<br />{c.phone}<br />{c.email}<br />{c.address}</p>
          </div>
        )}
        <div className="card">
          <div className="row between"><h3>Sites</h3>
            <button onClick={() => setAddingSite(true)}>+ Add</button>
          </div>
          {addingSite && (
            <SiteForm
              customers={[c]}
              fixedCustomerId={c.id}
              onCancel={() => setAddingSite(false)}
              onSubmit={(cid, name, address) => { addSite({ customerId: cid, name, address }); setAddingSite(false) }}
            />
          )}
          <ul>{sites.map((s) => <li key={s.id}>{s.name} <span className="muted">{s.address}</span></li>)}</ul>
          {!sites.length && !addingSite && <p className="muted">No sites yet. Add one to create quotes.</p>}
        </div>
      </div>
      <div className="row between"><h3>Quotes</h3>
        <button disabled={!sites.length} onClick={() => setAddingQuote(true)}>+ New quote</button>
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
  const { db, addSite } = useStore()
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="row between"><h1>Sites ({db.sites.length})</h1>
        <button disabled={!db.customers.length} onClick={() => setOpen(true)}>+ New site</button>
      </div>
      {open && (
        <SiteForm
          customers={db.customers}
          onCancel={() => setOpen(false)}
          onSubmit={(customerId, name, address) => { addSite({ customerId, name, address }); setOpen(false) }}
        />
      )}
      <table>
        <thead><tr><th>Site</th><th>Customer</th><th>Address</th></tr></thead>
        <tbody>
          {db.sites.map((s) => (
            <tr key={s.id}><td>{s.name}</td><td><Link to={`/customers/${s.customerId}`}>{db.customers.find((c) => c.id === s.customerId)?.name}</Link></td><td>{s.address}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
