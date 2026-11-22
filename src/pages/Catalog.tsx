import { useState } from 'react'
import { useStore } from '../store'
import { money, sellFromCost } from '../lib/costing'
import type { CatalogPart } from '../types'

const blank: Omit<CatalogPart, 'id'> = { partNo: '', description: '', vendor: '', category: '', cost: 0, markupPct: 30, stock: 0 }

export default function Catalog() {
  const { db, upsertPart, deletePart } = useStore()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<(Omit<CatalogPart, 'id'> & { id?: string }) | null>(null)
  const rows = db.catalog.filter((p) => `${p.partNo} ${p.description} ${p.vendor} ${p.category}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <div className="row between">
        <h1>Catalog ({rows.length})</h1>
        <button onClick={() => setEdit({ ...blank })}>+ Add part</button>
      </div>
      <input className="wide" placeholder="Search parts…" value={q} onChange={(e) => setQ(e.target.value)} />
      <table>
        <thead><tr><th>Part no.</th><th>Description</th><th>Vendor</th><th>Category</th><th>Cost</th><th>Markup</th><th>Sell</th><th>Stock</th><th /></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.partNo}</td><td>{p.description}</td><td>{p.vendor}</td><td>{p.category}</td>
              <td>{money(p.cost)}</td><td>{p.markupPct}%</td><td>{money(sellFromCost(p.cost, p.markupPct))}</td>
              <td className={p.stock < 5 ? 'low' : ''}>{p.stock}</td>
              <td><button onClick={() => setEdit(p)}>Edit</button> <button onClick={() => confirm('Delete part?') && deletePart(p.id)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {edit && (
        <div className="modal-bg" onClick={() => setEdit(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); upsertPart(edit); setEdit(null) }}>
            <h3>{edit.id ? 'Edit part' : 'New part'}</h3>
            {(['partNo', 'description', 'vendor', 'category'] as const).map((k) => (
              <label key={k}>{k}<input required={k === 'partNo' || k === 'description'} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></label>
            ))}
            {(['cost', 'markupPct', 'stock'] as const).map((k) => (
              <label key={k}>{k}<input type="number" step="0.01" min="0" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: Number(e.target.value) })} /></label>
            ))}
            <div className="row"><button type="submit">Save</button><button type="button" onClick={() => setEdit(null)}>Cancel</button></div>
          </form>
        </div>
      )}
    </>
  )
}
