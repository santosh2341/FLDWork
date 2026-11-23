import { useState } from 'react'
import FilterBar, { useFilter } from '../components/FilterBar'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { money, sellFromCost } from '../lib/costing'
import type { PreBuild } from '../types'
import { uid } from '../lib/id'


export function Inventory() {
  const { db } = useStore()
  const total = db.catalog.reduce((a, p) => a + p.stock * p.cost, 0)
  const low = useFilter() === 'low'
  const rows = low ? db.catalog.filter((p) => p.stock < 5) : db.catalog
  return (
    <>
      <h1>Inventory</h1>
      <p className="muted">Total stock value at cost: <b>{money(total)}</b></p>
      <FilterBar label="parts with fewer than 5 in stock" shown={rows.length} total={db.catalog.length} />
      <table>
        <thead><tr><th>Part no.</th><th>Description</th><th>Vendor</th><th className="num">In stock</th><th className="num">Cost</th><th className="num">Value</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.partNo}</td><td>{p.description}</td><td>{p.vendor}</td>
              <td className={`num ${p.stock < 5 ? 'low' : ''}`}>{p.stock}</td>
              <td className="num">{money(p.cost)}</td><td className="num">{money(p.stock * p.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function PurchaseOrders() {
  const { db, createPO, setPOStatus, receivePO } = useStore()
  const [vendor, setVendor] = useState('')
  const [lines, setLines] = useState<{ partId: string; qty: number; unitCost: number }[]>([])
  const [recv, setRecv] = useState<Record<string, number>>({})
  const [err, setErr] = useState('')
  const [recvErr, setRecvErr] = useState<{ po: number; msg: string } | null>(null)
  const vendors = [...new Set(db.catalog.map((p) => p.vendor).filter(Boolean))]
  const partName = (id: string) => db.catalog.find((p) => p.id === id)?.description ?? id

  const create = () => {
    if (!vendor.trim()) return setErr('Enter or choose a vendor.')
    if (lines.length === 0) return setErr('Add at least one line.')
    if (lines.some((l) => !l.partId || !(l.qty > 0))) return setErr('Every line needs a part and a quantity above zero.')
    void createPO(vendor.trim(), lines)
    setLines([])
    setErr('')
  }

  return (
    <>
      <h1>Purchase Orders ({db.purchaseOrders.length})</h1>
      <div className="card">
        <h3>New purchase order</h3>
        <div className="row wrap">
          <input list="vendor-list" placeholder="Vendor (pick or type) *" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          <datalist id="vendor-list">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
          <button onClick={() => setLines([...lines, { partId: '', qty: 1, unitCost: 0 }])}>+ Line</button>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="row wrap qrow">
            <select
              value={l.partId}
              onChange={(e) => {
                const p = db.catalog.find((x) => x.id === e.target.value)
                setLines(lines.map((x, j) => (j === i ? { ...x, partId: e.target.value, unitCost: p?.cost ?? 0 } : x)))
              }}
            >
              <option value="">Part…</option>
              {db.catalog.filter((p) => !vendor || !vendors.includes(vendor) || p.vendor === vendor).map((p) => <option key={p.id} value={p.id}>{p.partNo} – {p.description}</option>)}
            </select>
            <input type="number" min="1" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
            <input type="number" min="0" step="0.01" value={l.unitCost} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitCost: Number(e.target.value) } : x)))} />
            <button onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button className="primary" onClick={create}>Create PO</button>
        {err && <p className="error">{err}</p>}
      </div>

      {db.purchaseOrders.map((po) => (
        <div key={po.id} className="card">
          <div className="row between">
            <h3>PO {po.id} – {po.vendor} <span className="muted">{po.createdAt} · {po.status} · {money(po.lines.reduce((a, l) => a + l.qty * l.unitCost, 0))}</span></h3>
            <div className="row">
              <Link className="btn" to={`/materials/purchase-orders/${po.id}/print`}>Print / PDF</Link>
              {po.status === 'draft' && <button onClick={() => setPOStatus(po.id, 'ordered')}>Mark as ordered</button>}
              {(po.status === 'draft' || po.status === 'ordered') && po.lines.every((l) => l.received === 0) && (
                <button className="link-btn" onClick={() => confirm(`Cancel PO ${po.id}?`) && setPOStatus(po.id, 'cancelled')}>Cancel PO</button>
              )}
            </div>
          </div>
          <table>
            <thead><tr><th>Part</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Unit cost</th>{po.status === 'ordered' && <th>Receive now</th>}</tr></thead>
            <tbody>
              {po.lines.map((l) => (
                <tr key={l.id}>
                  <td>{partName(l.partId)}</td><td className="num">{l.qty}</td><td className="num">{l.received}</td><td className="num">{money(l.unitCost)}</td>
                  {po.status === 'ordered' && (
                    <td><input type="number" min="0" max={l.qty - l.received} value={recv[l.id] ?? 0} onChange={(e) => setRecv({ ...recv, [l.id]: Number(e.target.value) })} /></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {po.status === 'ordered' && (
            <button className="primary" onClick={() => {
              const bad = po.lines.find((l) => (recv[l.id] ?? 0) > l.qty - l.received || (recv[l.id] ?? 0) < 0)
              if (bad) return setRecvErr({ po: po.id, msg: `You can only receive up to ${bad.qty - bad.received} of ${partName(bad.partId)}.` })
              if (!po.lines.some((l) => (recv[l.id] ?? 0) > 0)) return setRecvErr({ po: po.id, msg: 'Enter a quantity received on at least one line.' })
              setRecvErr(null)
              receivePO(po.id, recv)
              setRecv({})
            }}>Receive items</button>
          )}
          {recvErr?.po === po.id && <p className="error">{recvErr.msg}</p>}
        </div>
      ))}
    </>
  )
}

export function InventoryCounts() {
  const { db, createCount, setCountLine, applyCount } = useStore()
  const [open, setOpen] = useState<string | null>(db.counts[0]?.id ?? null)
  const partName = (id: string) => db.catalog.find((p) => p.id === id)?.description ?? id
  const sel = db.counts.find((c) => c.id === open)
  return (
    <>
      <div className="row between"><h1>Inventory Counts</h1><button onClick={async () => { const id = await createCount(); if (id) setOpen(id) }}>+ New count</button></div>
      <div className="subtabs">
        {db.counts.map((c) => <button key={c.id} className={c.id === open ? 'active' : ''} onClick={() => setOpen(c.id)}>{c.date}{c.applied ? ' ✓' : ''}</button>)}
      </div>
      {!sel && <p className="muted">Start a count to record what is physically on the shelf.</p>}
      {sel && (
        <>
          <table>
            <thead><tr><th>Part</th><th className="num">Expected</th><th className="num">Counted</th><th className="num">Variance</th></tr></thead>
            <tbody>
              {sel.lines.map((l) => (
                <tr key={l.partId}>
                  <td>{partName(l.partId)}</td><td className="num">{l.expected}</td>
                  <td className="num"><input type="number" min="0" disabled={sel.applied} value={l.counted} onChange={(e) => setCountLine(sel.id, l.partId, Number(e.target.value))} /></td>
                  <td className={`num ${l.counted !== l.expected ? 'low' : ''}`}>{l.counted - l.expected}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sel.applied && <button className="primary" onClick={() => confirm('Update stock levels to the counted quantities?') && applyCount(sel.id)}>Apply count to stock</button>}
          {sel.applied && <p className="muted">This count has been applied to stock.</p>}
        </>
      )}
    </>
  )
}

export function PreBuilds() {
  const { db, upsertPreBuild } = useStore()
  const [draft, setDraft] = useState<PreBuild | null>(null)
  return (
    <>
      <div className="row between">
        <h1>Pre-Builds ({db.preBuilds.length})</h1>
        <button onClick={() => setDraft({ id: uid(), name: 'New pre-build', items: [] })}>+ New pre-build</button>
      </div>
      <p className="muted">Reusable bundles of parts and labour. Add one to any quote from its Parts &amp; Labor tab.</p>
      {[...db.preBuilds.filter((p) => p.id !== draft?.id), ...(draft ? [draft] : [])].map((p) => {
        const editing = draft?.id === p.id
        const cur = editing ? draft! : p
        const sell = cur.items.reduce((a, i) => a + i.quantity * i.unitSell, 0)
        return (
          <div key={p.id} className="card">
            <div className="row between">
              {editing ? <input className="cc-name" value={cur.name} onChange={(e) => setDraft({ ...cur, name: e.target.value })} /> : <h3>{p.name}</h3>}
              <div className="row">
                <b>{money(sell)}</b>
                {editing
                  ? <><button className="primary" onClick={() => { upsertPreBuild(cur); setDraft(null) }}>Save</button><button onClick={() => setDraft(null)}>Cancel</button></>
                  : <button onClick={() => setDraft(JSON.parse(JSON.stringify(p)))}>Edit</button>}
              </div>
            </div>
            <table>
              <thead><tr><th>Item</th><th className="num">Qty / hrs</th><th className="num">Sell</th>{editing && <th />}</tr></thead>
              <tbody>
                {cur.items.map((i, idx) => (
                  <tr key={idx}>
                    <td>{i.description}</td>
                    <td className="num">{editing ? <input type="number" min="0" step="0.25" value={i.quantity} onChange={(e) => setDraft({ ...cur, items: cur.items.map((x, j) => (j === idx ? { ...x, quantity: Number(e.target.value) } : x)) })} /> : i.quantity}</td>
                    <td className="num">{money(i.unitSell)}</td>
                    {editing && <td><button onClick={() => setDraft({ ...cur, items: cur.items.filter((_, j) => j !== idx) })}>×</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {editing && (
              <div className="row">
                <select value="" onChange={(e) => {
                  const part = db.catalog.find((x) => x.id === e.target.value)
                  if (part) setDraft({ ...cur, items: [...cur.items, { kind: 'part', partId: part.id, description: part.description, quantity: 1, unitCost: part.cost, unitSell: sellFromCost(part.cost, part.markupPct) }] })
                }}>
                  <option value="">+ Part…</option>
                  {db.catalog.map((x) => <option key={x.id} value={x.id}>{x.partNo} – {x.description}</option>)}
                </select>
                <button onClick={() => setDraft({ ...cur, items: [...cur.items, { kind: 'labour', description: 'Electrical', quantity: 1, unitCost: 55, unitSell: 90 }] })}>+ Labour</button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

const QUOTE_LABEL = { requested: 'Requested', received: 'Received', accepted: 'Accepted', rejected: 'Rejected' } as const

export function VendorQuotes() {
  const { db, createVendorQuote, saveVendorQuote, acceptVendorQuote } = useStore()
  const [vendor, setVendor] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [lines, setLines] = useState<{ partId: string; qty: number; unitCost: number }[]>([])
  const [err, setErr] = useState('')
  const vendors = [...new Set(db.catalog.map((p) => p.vendor).filter(Boolean))]
  const part = (id: string) => db.catalog.find((p) => p.id === id)
  const todayStr = new Date().toISOString().slice(0, 10)

  const create = () => {
    if (!vendor.trim()) return setErr('Enter or choose a vendor.')
    if (lines.length === 0) return setErr('Add at least one line.')
    if (lines.some((l) => !l.partId || !(l.qty > 0))) return setErr('Every line needs a part and a quantity above zero.')
    void createVendorQuote(vendor.trim(), validUntil, lines)
    setLines([])
    setValidUntil('')
    setErr('')
  }

  return (
    <>
      <h1>Vendor Quotes ({db.vendorQuotes.length})</h1>
      <div className="card">
        <h3>Request a quote</h3>
        <div className="row wrap">
          <input list="vendor-list" placeholder="Vendor (pick or type) *" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          <datalist id="vendor-list">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
          <label>Valid until <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label>
          <button onClick={() => setLines([...lines, { partId: '', qty: 1, unitCost: 0 }])}>+ Line</button>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="row wrap qrow">
            <select value={l.partId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, partId: e.target.value, unitCost: part(e.target.value)?.cost ?? 0 } : x)))}>
              <option value="">Part…</option>
              {db.catalog.filter((p) => !vendor || !vendors.includes(vendor) || p.vendor === vendor).map((p) => <option key={p.id} value={p.id}>{p.partNo} – {p.description}</option>)}
            </select>
            <input type="number" min="1" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
            <button onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button className="primary" onClick={create}>Create request</button>
        {err && <p className="error">{err}</p>}
      </div>

      {db.vendorQuotes.map((q) => {
        const expired = !!q.validUntil && q.validUntil < todayStr
        const total = q.lines.reduce((a, l) => a + l.qty * l.unitCost, 0)
        return (
          <div key={q.id} className="card">
            <div className="row between">
              <h3>Quote {q.id} – {q.vendor} <span className="muted">{QUOTE_LABEL[q.status]} · {q.createdAt}{q.validUntil ? ` · valid until ${q.validUntil}` : ''}</span> {expired && q.status !== 'accepted' && <span className="badge">Expired</span>}</h3>
              <b>{money(total)}</b>
            </div>
            <table>
              <thead><tr><th>Part</th><th className="num">Qty</th><th className="num">Quoted unit cost</th><th className="num">Catalog cost</th><th className="num">Line total</th></tr></thead>
              <tbody>
                {q.lines.map((l) => {
                  const cat = part(l.partId)?.cost ?? 0
                  return (
                    <tr key={l.id}>
                      <td>{part(l.partId)?.description ?? l.partId}</td>
                      <td className="num">{l.qty}</td>
                      <td className="num">
                        {q.status === 'requested'
                          ? <input type="number" min="0" step="0.01" value={l.unitCost} onChange={(e) => saveVendorQuote({ ...q, lines: q.lines.map((x) => (x.id === l.id ? { ...x, unitCost: Number(e.target.value) } : x)) })} />
                          : money(l.unitCost)}
                      </td>
                      <td className={`num ${l.unitCost > cat ? 'low' : ''}`}>{money(cat)}</td>
                      <td className="num">{money(l.qty * l.unitCost)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 8 }}>
              {q.status === 'requested' && <><button className="primary" onClick={() => saveVendorQuote({ ...q, status: 'received' })}>Mark quote received</button><button onClick={() => saveVendorQuote({ ...q, status: 'rejected' })}>Cancel request</button></>}
              {q.status === 'received' && <>
                <button className="primary" disabled={expired} title={expired ? 'This quote has expired' : ''} onClick={() => void acceptVendorQuote(q.id)}>Accept and create PO</button>
                <button onClick={() => saveVendorQuote({ ...q, status: 'rejected' })}>Reject</button>
              </>}
              {q.status === 'accepted' && <Link to="/materials/purchase-orders">Created PO {q.poId}</Link>}
            </div>
          </div>
        )
      })}
      {db.vendorQuotes.length === 0 && <p className="muted">No vendor quotes yet.</p>}
    </>
  )
}

export function Receipts() {
  const { db } = useStore()
  const part = (id: string) => db.catalog.find((p) => p.id === id)?.description ?? id
  return (
    <>
      <h1>Receipts ({db.receipts.length})</h1>
      <p className="muted">A receipt is recorded every time items are received against a purchase order.</p>
      <table>
        <thead><tr><th>Receipt</th><th>Date</th><th>PO</th><th>Vendor</th><th>Items received</th><th className="num">Value</th></tr></thead>
        <tbody>
          {db.receipts.map((r) => (
            <tr key={r.id}>
              <td>R-{r.id}</td>
              <td>{r.date}</td>
              <td><Link to="/materials/purchase-orders">{r.poId}</Link></td>
              <td>{db.purchaseOrders.find((p) => p.id === r.poId)?.vendor}</td>
              <td>{r.lines.map((l) => `${l.qty} × ${part(l.partId)}`).join(', ')}</td>
              <td className="num">{money(r.lines.reduce((a, l) => a + l.qty * l.unitCost, 0))}</td>
            </tr>
          ))}
          {db.receipts.length === 0 && <tr><td colSpan={6} className="muted">Nothing received yet.</td></tr>}
        </tbody>
      </table>
    </>
  )
}
