import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QuoteForm } from './Simple'
import { useStore } from '../store'
import { computeCosting, money, STATUS_COLOR, STATUS_LABEL } from '../lib/costing'

export default function Quotes() {
  const { db, createQuote } = useStore()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="row between"><h1>Quotes ({db.quotes.length})</h1><button disabled={!db.customers.length} onClick={() => setOpen(true)}>+ New quote</button></div>
      {open && (
        <QuoteForm
          customers={db.customers}
          sites={db.sites}
          onCancel={() => setOpen(false)}
          onSubmit={async (cid, sid, name) => { const id = await createQuote(cid, sid, name); if (id) nav(`/quotes/${id}`) }}
        />
      )}
      <table>
        <thead><tr><th>#</th><th>Name</th><th>Customer</th><th>Site</th><th>Status</th><th>Total</th></tr></thead>
        <tbody>
          {db.quotes.map((q) => (
            <tr key={q.id}>
              <td><Link to={`/quotes/${q.id}`}>{q.id}</Link></td>
              <td>{q.name}</td>
              <td>{db.customers.find((c) => c.id === q.customerId)?.name}</td>
              <td>{db.sites.find((s) => s.id === q.siteId)?.name}</td>
              <td><i className="dot" style={{ background: STATUS_COLOR[q.status] }} />{STATUS_LABEL[q.status]}</td>
              <td>{money(computeCosting(q).total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
