import { useState } from 'react'
import FilterBar, { useFilter, useStartOpen } from '../components/FilterBar'
import { Link, useNavigate } from 'react-router-dom'
import { QuoteForm } from './Simple'
import AiQuoteDraft from '../components/AiQuoteDraft'
import { useStore } from '../store'
import { computeCosting, money, STATUS_COLOR, STATUS_LABEL } from '../lib/costing'

export default function Quotes() {
  const { db, createQuote, canWrite, remote } = useStore()
  const nav = useNavigate()
  const startOpen = useStartOpen()
  const [open, setOpen] = useState(startOpen)
  const [ai, setAi] = useState(false)
  const todo = useFilter() === 'to_be_completed'
  const rows = todo ? db.quotes.filter((q) => q.status === 'to_be_completed') : db.quotes
  return (
    <>
      <div className="row between"><h1>Quotes ({db.quotes.length})</h1><div className="row">{canWrite && remote && <button className="ai-btn" disabled={!db.customers.length} onClick={() => setAi(true)}>✨ Draft with AI</button>}{canWrite && <button disabled={!db.customers.length} onClick={() => setOpen(true)}>+ New quote</button>}</div></div>
      {ai && <AiQuoteDraft onClose={() => setAi(false)} />}
      {open && (
        <QuoteForm
          customers={db.customers}
          sites={db.sites}
          onCancel={() => setOpen(false)}
          onSubmit={async (cid, sid, name) => { const id = await createQuote(cid, sid, name); if (id) nav(`/quotes/${id}`) }}
        />
      )}
      <FilterBar label="quotes still to be completed" shown={rows.length} total={db.quotes.length} />
      <table>
        <thead><tr><th>#</th><th>Name</th><th>Customer</th><th>Site</th><th>Status</th><th>Total</th></tr></thead>
        <tbody>
          {rows.map((q) => (
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
