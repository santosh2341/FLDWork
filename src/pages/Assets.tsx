import { useDialog } from '../components/dialog'
import { dmy } from '../lib/dates'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { usePaged } from '../components/Paged'
import FilterBar from '../components/FilterBar'
import CustomerPicker from '../components/CustomerPicker'
import { useFilter, useStartOpen } from '../components/useFilter'
import { CATEGORIES, DUE_LABEL, addMonths, dueState, todayIso } from '../lib/assets'
import type { Asset } from '../types'

type Draft = Omit<Asset, 'id' | 'services'> & { id?: string; services?: Asset['services'] }
const blank = (customerId = '', siteId = ''): Draft => ({ customerId, siteId, name: '', category: '', make: '', model: '', serial: '', location: '', installDate: '', warrantyUntil: '', intervalMonths: undefined, lastServiced: '', nextDue: '', notes: '', active: true })

export function AssetForm({ initial, onSave, onCancel }: { initial: Draft; onSave: (d: Draft) => void; onCancel: () => void }) {
  const { db } = useStore()
  const [f, setF] = useState<Draft>(initial)
  const [err, setErr] = useState('')
  const sites = db.sites.filter((s) => s.customerId === f.customerId)
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.customerId) return setErr('Choose the customer.')
    if (!f.name.trim()) return setErr('Give the equipment a name, for example "Rooftop split system".')
    if (f.intervalMonths !== undefined && (!Number.isInteger(f.intervalMonths) || f.intervalMonths < 1 || f.intervalMonths > 120)) return setErr('Service interval must be a whole number of months (1–120).')
    // work out the next due date from the last service if it was not typed in
    const next = f.nextDue || (f.lastServiced && f.intervalMonths ? addMonths(f.lastServiced, f.intervalMonths) : '')
    onSave({ ...f, name: f.name.trim(), nextDue: next })
  }
  return (
    <form className="card" onSubmit={submit}>
      <h3>{f.id ? 'Edit equipment' : 'New equipment'}</h3>
      <div className="grid2">
        <div className="block">Customer *<br />
          <CustomerPicker value={f.customerId} onChange={(id) => setF({ ...f, customerId: id, siteId: '' })} />
        </div>
        <label className="block">Site<br />
          <select className="wide" value={f.siteId ?? ''} onChange={set('siteId')} disabled={!f.customerId}>
            <option value="">Not specified</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block">Name *<br /><input className="wide" value={f.name} onChange={set('name')} placeholder="Rooftop split system" /></label>
        <label className="block">Type<br />
          <select className="wide" value={f.category} onChange={set('category')}>
            <option value="">Choose…</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="block">Make<br /><input className="wide" value={f.make} onChange={set('make')} /></label>
        <label className="block">Model<br /><input className="wide" value={f.model} onChange={set('model')} /></label>
        <label className="block">Serial number<br /><input className="wide" value={f.serial} onChange={set('serial')} /></label>
        <label className="block">Location on site<br /><input className="wide" value={f.location} onChange={set('location')} placeholder="Level 2 plant room" /></label>
        <label className="block">Installed<br /><input type="date" value={f.installDate ?? ''} onChange={set('installDate')} /></label>
        <label className="block">Warranty until<br /><input type="date" value={f.warrantyUntil ?? ''} onChange={set('warrantyUntil')} /></label>
        <label className="block">Service every (months)<br /><input type="number" min={1} max={120} value={f.intervalMonths ?? ''} onChange={(e) => setF({ ...f, intervalMonths: e.target.value ? Number(e.target.value) : undefined })} placeholder="e.g. 6" /></label>
        <label className="block">Last serviced<br /><input type="date" value={f.lastServiced ?? ''} onChange={set('lastServiced')} /></label>
        <label className="block">Next service due<br /><input type="date" value={f.nextDue ?? ''} onChange={set('nextDue')} /><br /><span className="muted">Leave blank to work it out from the last service and interval.</span></label>
      </div>
      <label className="block">Notes<br /><textarea className="wide" rows={2} value={f.notes} onChange={set('notes')} /></label>
      <label><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> In service (untick if removed or replaced)</label>
      {err && <p className="error">{err}</p>}
      <div className="row"><button type="submit" className="primary">Save</button><button type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  )
}

export default function Assets() {
  const { ask, tell } = useDialog()
  const { db, canWrite, addAsset, updateAsset, deleteAsset, logAssetService, createQuote, profile } = useStore()
  const nav = useNavigate()
  const dueOnly = useFilter() === 'due'
  const [q, setQ] = useState('')
  const [params] = useSearchParams()
  const askedCust = params.get('customer') ?? '' // from the customer page
  const [cust, setCust] = useState(() => (db.customers.some((c) => c.id === askedCust) ? askedCust : ''))
  const startOpen = useStartOpen()
  const [form, setForm] = useState<Draft | null>(() => (startOpen ? blank(cust) : null))
  const [openId, setOpenId] = useState('')
  const [note, setNote] = useState('')

  const rows = db.assets
    .filter((a) => !cust || a.customerId === cust)
    .filter((a) => !dueOnly || ['overdue', 'soon'].includes(dueState(a)))
    .filter((a) => `${a.name} ${a.make} ${a.model} ${a.serial} ${a.location} ${a.category}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (a.nextDue ?? '9999').localeCompare(b.nextDue ?? '9999'))
  const { shown, more } = usePaged(rows, `${cust}|${dueOnly}|${q}`)
  const cname = (id: string) => db.customers.find((c) => c.id === id)?.name ?? ''

  const save = (d: Draft) => {
    if (d.id) updateAsset({ ...(d as Asset), services: d.services ?? [] })
    else addAsset(d)
    setForm(null)
  }

  const serviceQuote = async (a: Asset) => {
    const site = a.siteId || db.sites.find((s) => s.customerId === a.customerId)?.id
    if (!site) return void tell('Add a site for this customer first, then create the service quote.')
    const id = await createQuote(a.customerId, site, `Service – ${a.name}`)
    nav(`/quotes/${id}`)
  }

  return (
    <>
      <div className="row between">
        <h1>Equipment ({db.assets.length})</h1>
        {canWrite && <button disabled={!db.customers.length} onClick={() => setForm(blank(cust))}>+ New equipment</button>}
      </div>
      {form && <AssetForm initial={form} onSave={save} onCancel={() => setForm(null)} />}
      <FilterBar label="equipment overdue or due within 30 days" shown={rows.length} total={db.assets.length} />
      <div className="row wrap" style={{ margin: '8px 0' }}>
        <input placeholder="Search name, make, model, serial…" value={q} onChange={(e) => setQ(e.target.value)} />
        <CustomerPicker value={cust} onChange={setCust} allLabel="All customers" />
      </div>
      {db.assets.length === 0 && !form && <p className="muted">No equipment recorded yet. Add the units you service (air conditioners, fire panels, switchboards…) to track service history and when each is next due.</p>}
      {db.assets.length > 0 && rows.length === 0 && (
        <p className="muted">No equipment matches{cust ? ` for ${db.customers.find((c) => c.id === cust)?.name ?? 'this customer'}` : ''}{q.trim() ? ` and "${q.trim()}"` : ''}. {canWrite && cust ? 'Use "+ New equipment" to add one for them.' : 'Try another search.'}</p>
      )}
      {rows.length > 0 && (
        <table>
          <thead><tr><th>Equipment</th><th>Customer / site</th><th>Type</th><th>Last serviced</th><th>Next due</th><th></th></tr></thead>
          <tbody>
            {shown.map((a) => {
              const st = dueState(a)
              const open = openId === a.id
              return (
                <>
                  <tr key={a.id} style={a.active ? undefined : { opacity: 0.55 }}>
                    <td><button className="link-btn" onClick={() => setOpenId(open ? '' : a.id)}>{a.name}</button><br /><span className="muted">{[a.make, a.model, a.serial && `S/N ${a.serial}`].filter(Boolean).join(' · ')}</span></td>
                    <td><Link to={`/customers/${a.customerId}`}>{cname(a.customerId)}</Link><br /><span className="muted">{db.sites.find((s) => s.id === a.siteId)?.name}{a.location ? ` · ${a.location}` : ''}</span></td>
                    <td>{a.category}</td>
                    <td>{a.lastServiced || '–'}</td>
                    <td>{a.nextDue || '–'} {st !== 'none' && <span className={`pill due-${st}`}>{DUE_LABEL[st]}</span>}{!a.active && <span className="pill">Retired</span>}</td>
                    <td>{canWrite && <button onClick={() => setForm({ ...a })}>Edit</button>}</td>
                  </tr>
                  {open && (
                    <tr key={a.id + 'd'}>
                      <td colSpan={6}>
                        <div className="card">
                          <div className="row wrap">
                            {a.warrantyUntil && <span>Warranty until {a.warrantyUntil}</span>}
                            {a.intervalMonths && <span>Serviced every {a.intervalMonths} months</span>}
                            {a.installDate && <span>Installed {a.installDate}</span>}
                          </div>
                          {a.notes && <p>{a.notes}</p>}
                          <b>Service history</b>
                          {a.services.length === 0 && <p className="muted">No services recorded.</p>}
                          <ul>{a.services.map((s) => <li key={s.id}><b>{dmy(s.date)}</b> {s.by && `· ${s.by}`}{s.jobId ? ` · job #${s.jobId}` : ''}{s.notes && <><br />{s.notes}</>}</li>)}</ul>
                          {canWrite && (
                            <div style={{ display: 'grid', gap: 6, maxWidth: 520 }}>
                              <textarea rows={2} placeholder="Service notes (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                              <div className="row">
                                <button className="primary" onClick={() => { logAssetService(a.id, todayIso(), note.trim(), profile?.fullName ?? '', undefined); setNote('') }}>Log service today</button>
                                <button onClick={() => void serviceQuote(a)}>Create service quote</button>
                                <button className="link-btn" onClick={async () => { if (await ask({ message: `Delete "${a.name}" and its service history? This cannot be undone.`, confirmLabel: 'Delete', danger: true })) deleteAsset(a.id) }}>Delete</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      )}
      {more}
    </>
  )
}
