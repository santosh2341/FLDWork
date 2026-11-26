import { useDialog } from '../components/dialog'
import { exportParts } from '../lib/accounting'
import { useState } from 'react'
import { useStore } from '../store'
import { money, sellFromCost } from '../lib/costing'
import type { CatalogPart } from '../types'
import { usePaged } from '../components/Paged'

const blank: Omit<CatalogPart, 'id'> = { partNo: '', description: '', vendor: '', category: '', cost: 0, markupPct: 30, stock: 0 }
const TEXT_FIELDS = [
  ['partNo', 'Part number', 'e.g. RCBO-20A'],
  ['description', 'Description', 'e.g. RCBO 20A 30mA, 1 pole'],
  ['vendor', 'Supplier', 'e.g. Rexel'],
  ['category', 'Category', 'e.g. Electrical'],
] as const
const NUM_FIELDS = [
  ['cost', 'Cost ($, ex GST)', '0.01'],
  ['markupPct', 'Markup %', '0.1'],
  ['stock', 'In stock', '1'],
] as const

export default function Catalog() {
  const { ask } = useDialog()
  const { db, upsertPart, deletePart, canWrite } = useStore()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<(Omit<CatalogPart, 'id'> & { id?: string }) | null>(null)
  const rows = db.catalog.filter((p) => `${p.partNo} ${p.description} ${p.vendor} ${p.category}`.toLowerCase().includes(q.toLowerCase()))
  const { shown, more } = usePaged(rows, q)

  return (
    <>
      <div className="row between">
        <h1>Catalog ({rows.length})</h1>
        <div className="row"><button onClick={() => exportParts(db.catalog)}>Export CSV</button>{canWrite && <button onClick={() => setEdit({ ...blank })}>+ Add part</button>}</div>
      </div>
      <input className="wide" placeholder="Search parts…" value={q} onChange={(e) => setQ(e.target.value)} />
      <table>
        <thead><tr><th>Part no.</th><th>Description</th><th>Vendor</th><th>Category</th><th>Cost</th><th>Markup</th><th>Sell</th><th>Stock</th><th /></tr></thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id}>
              <td>{p.partNo}</td><td>{p.description}</td><td>{p.vendor}</td><td>{p.category}</td>
              <td>{money(p.cost)}</td><td>{p.markupPct}%</td><td>{money(sellFromCost(p.cost, p.markupPct))}</td>
              <td className={p.stock < 5 ? 'low' : ''}>{p.stock}</td>
              <td>{canWrite && <><button onClick={() => setEdit(p)}>Edit</button> <button onClick={async () => { if (await ask({ message: `Delete part ${p.partNo}?`, confirmLabel: 'Delete', danger: true })) deletePart(p.id) }}>Delete</button></>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {more}

      {edit && (
        <div className="modal-bg" onClick={() => setEdit(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); upsertPart(edit); setEdit(null) }}>
            <h3>{edit.id ? 'Edit part' : 'New part'}</h3>
            {TEXT_FIELDS.map(([k, label, hint]) => (
              <label key={k}>{label}<input required={k === 'partNo' || k === 'description'} placeholder={hint} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></label>
            ))}
            <div className="row" style={{ gap: 10 }}>
              {NUM_FIELDS.map(([k, label, step]) => (
                <label key={k} style={{ flex: 1, minWidth: 0 }}>{label}<input type="number" step={step} min="0" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: Number(e.target.value) })} /></label>
              ))}
            </div>
            <p className="muted" style={{ margin: 0 }}>Markup is added on top of your cost. Sell price: <b>{money(sellFromCost(edit.cost, edit.markupPct))}</b> ex GST</p>
            <div className="row"><button type="submit" className="primary">{edit.id ? 'Save part' : 'Add part'}</button><button type="button" onClick={() => setEdit(null)}>Cancel</button></div>
          </form>
        </div>
      )}
    </>
  )
}
