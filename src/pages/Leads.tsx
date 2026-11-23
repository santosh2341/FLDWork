import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStartOpen } from '../components/FilterBar'
import { useStore } from '../store'
import type { LeadStatus } from '../types'
import AddressFields from '../components/AddressFields'
import type { AddressValue } from '../components/AddressFields'
import { emptyAddress, formatAddress, isBlank, validateAddress } from '../lib/address'

const LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  lost: 'Lost',
  converted: 'Converted',
}
const SOURCES = ['Website', 'Referral', 'Phone', 'Walk-in', 'Other']
const EMPTY = { name: '', contactName: '', phone: '', email: '', address: '', source: 'Website', notes: '' }

export default function Leads() {
  const { db, addLead, updateLead, convertLead, canWrite } = useStore()
  const nav = useNavigate()
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all')
  const [q, setQ] = useState('')
  const startOpen = useStartOpen()
  const [adding, setAdding] = useState(startOpen)
  const [form, setForm] = useState(EMPTY)
  const [addr, setAddr] = useState<AddressValue>({ parts: emptyAddress, point: null })
  const [error, setError] = useState('')

  const rows = db.leads
    .filter((l) => filter === 'all' || l.status === filter)
    .filter((l) => `${l.name} ${l.contactName} ${l.email} ${l.phone}`.toLowerCase().includes(q.trim().toLowerCase()))

  const save = () => {
    if (!form.name.trim()) return setError('A lead needs a name.')
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('That email address does not look right.')
    if (!isBlank(addr.parts)) {
      const bad = validateAddress(addr.parts)
      if (bad) return setError(bad)
    }
    addLead({ ...form, name: form.name.trim(), email: form.email.trim(), address: isBlank(addr.parts) ? '' : formatAddress(addr.parts) })
    setAddr({ parts: emptyAddress, point: null })
    setForm(EMPTY)
    setError('')
    setAdding(false)
  }

  const convert = async (id: string) => {
    if (!confirm('Create a customer, site and draft quote from this lead?')) return
    const qid = await convertLead(id)
    if (qid) nav(`/quotes/${qid}`)
  }

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  return (
    <>
      <div className="row between">
        <h1>Leads ({rows.length})</h1>
        {canWrite && <button className="primary" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : '+ New lead'}</button>}
      </div>

      {adding && (
        <div className="card">
          <div className="row wrap">
            <input className="grow" placeholder="Company or person *" value={form.name} onChange={set('name')} />
            <input className="grow" placeholder="Contact name" value={form.contactName} onChange={set('contactName')} />
            <input placeholder="Phone" value={form.phone} onChange={set('phone')} />
            <input className="grow" placeholder="Email" value={form.email} onChange={set('email')} />
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <select value={form.source} onChange={set('source')}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
          </div>
          <AddressFields value={addr} onChange={setAddr} label="Site address (Australia, optional)" showMap={false} />
          <textarea rows={2} style={{ marginTop: 8 }} placeholder="What do they need?" value={form.notes} onChange={set('notes')} />
          {error && <p className="error">{error}</p>}
          <div className="row" style={{ marginTop: 8 }}><button className="primary" onClick={save}>Save lead</button></div>
        </div>
      )}

      <div className="subtabs">
        {(['all', 'new', 'contacted', 'qualified', 'lost', 'converted'] as const).map((f) => (
          <button key={f} className={f === filter ? 'active' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : LABEL[f]} ({f === 'all' ? db.leads.length : db.leads.filter((l) => l.status === f).length})
          </button>
        ))}
      </div>
      <input className="wide" placeholder="Search leads…" value={q} onChange={(e) => setQ(e.target.value)} />

      <table>
        <thead><tr><th>Lead</th><th>Contact</th><th>Phone</th><th>Source</th><th>Created</th><th>Status</th><th /></tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td><b>{l.name}</b><br /><span className="muted">{l.notes}</span></td>
              <td>{l.contactName}<br /><span className="muted">{l.email}</span></td>
              <td>{l.phone}</td>
              <td>{l.source}</td>
              <td>{l.createdAt}</td>
              <td>
                <select value={l.status} disabled={l.status === 'converted'} onChange={(e) => updateLead({ ...l, status: e.target.value as LeadStatus })}>
                  {(Object.keys(LABEL) as LeadStatus[])
                    .filter((k) => k !== 'converted' || l.status === 'converted')
                    .map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}
                </select>
              </td>
              <td>
                {l.quoteId ? (
                  <button onClick={() => nav(`/quotes/${l.quoteId}`)}>Open quote #{l.quoteId}</button>
                ) : (
                  <button disabled={l.status === 'lost'} title={l.status === 'lost' ? 'Reopen the lead to convert it' : ''} onClick={() => convert(l.id)}>Convert to quote</button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="muted">No leads match.</td></tr>}
        </tbody>
      </table>
    </>
  )
}
