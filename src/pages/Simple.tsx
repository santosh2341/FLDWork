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

export function Customers() {
  const { db, addCustomer } = useStore()
  const add = () => {
    const name = prompt('Customer name?')
    if (name) addCustomer({ name, contactName: '', phone: '', email: '', address: '', onHold: false })
  }
  return (
    <>
      <div className="row between"><h1>Customers ({db.customers.length})</h1><button onClick={add}>+ New customer</button></div>
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

export function CustomerDetail() {
  const { id } = useParams()
  const { db, addSite, updateCustomer, createQuote } = useStore()
  const nav = useNavigate()
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
        <div className="card">
          <h3>Contact</h3>
          <p>{c.contactName}<br />{c.phone}<br />{c.email}<br />{c.address}</p>
        </div>
        <div className="card">
          <div className="row between"><h3>Sites</h3>
            <button onClick={() => { const name = prompt('Site name?'); if (name) addSite({ customerId: c.id, name, address: prompt('Address?') ?? '' }) }}>+ Add</button>
          </div>
          <ul>{sites.map((s) => <li key={s.id}>{s.name} <span className="muted">{s.address}</span></li>)}</ul>
        </div>
      </div>
      <div className="row between"><h3>Quotes</h3>
        <button disabled={!sites.length} onClick={async () => { const name = prompt('Quote name?'); if (!name) return; const id = await createQuote(c.id, sites[0].id, name); if (id) nav(`/quotes/${id}`) }}>+ New quote</button>
      </div>
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
  const { db } = useStore()
  return (
    <>
      <h1>Sites ({db.sites.length})</h1>
      <table>
        <thead><tr><th>Site</th><th>Customer</th><th>Address</th></tr></thead>
        <tbody>
          {db.sites.map((s) => (
            <tr key={s.id}><td>{s.name}</td><td>{db.customers.find((c) => c.id === s.customerId)?.name}</td><td>{s.address}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
