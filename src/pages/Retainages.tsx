import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { usePaged } from '../components/Paged'
import { invoiceTotals, withLog } from '../lib/invoicing'
import { money } from '../lib/costing'

const retainageHeld = (total: number, pct: number) => Math.round(total * pct) / 100

export default function RetainageTable() {
  const { db, saveInvoice } = useStore()
  const rows = db.invoices.filter((i) => !i.voided && (i.retainagePct ?? 0) > 0)
  const { shown, more } = usePaged(rows)
  const held = rows.filter((i) => !i.retainageReleased).reduce((a, i) => a + retainageHeld(invoiceTotals(i).total, i.retainagePct ?? 0), 0)
  return (
    <>
      <p className="muted">Retainage is a share of the invoice the customer holds back until the work is signed off. Set the percentage on the invoice's Details tab. Currently held: <b>{money(held)}</b></p>
      <table>
        <thead><tr><th>Invoice</th><th>Customer</th><th className="num">Total</th><th className="num">Retainage %</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
        <tbody>
          {shown.map((i) => {
            const total = invoiceTotals(i).total
            return (
              <tr key={i.id}>
                <td><Link to={`/invoices/${i.id}`}>{i.id}</Link></td>
                <td>{db.customers.find((c) => c.id === i.customerId)?.name}</td>
                <td className="num">{money(total)}</td>
                <td className="num">{i.retainagePct}%</td>
                <td className="num">{money(retainageHeld(total, i.retainagePct ?? 0))}</td>
                <td>{i.retainageReleased ? 'Released' : 'Held'}</td>
                <td>
                  <button onClick={() => saveInvoice(withLog({ ...i, retainageReleased: !i.retainageReleased }, i.retainageReleased ? 'Retainage marked as held again' : 'Retainage released'))}>
                    {i.retainageReleased ? 'Mark held' : 'Release'}
                  </button>
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && <tr><td colSpan={7} className="muted">No invoices have retainage.</td></tr>}
        </tbody>
      </table>
      {more}
    </>
  )
}
