import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { computeCosting, money, STATUS_COLOR, STATUS_LABEL } from '../lib/costing'

export default function Quotes() {
  const { db, createQuote } = useStore()
  const nav = useNavigate()
  const add = async () => {
    const customerId = db.customers[0]?.id
    const site = db.sites.find((s) => s.customerId === customerId)
    if (!customerId || !site) return alert('Add a customer with a site first.')
    const name = prompt(`Quote name? (for ${db.customers[0].name}; change customer on the quote)`)
    if (name) {
      const id = await createQuote(customerId, site.id, name)
      if (id) nav(`/quotes/${id}`)
    }
  }
  return (
    <>
      <div className="row between"><h1>Quotes ({db.quotes.length})</h1><button onClick={add}>+ New quote</button></div>
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
