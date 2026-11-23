import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { invoiceState, invoiceTotals, STATE_COLOR, STATE_LABEL, withLog } from '../lib/invoicing'
import { money } from '../lib/costing'
import AiPolish from '../components/AiPolish'
import PreSendCheck from '../components/PreSendCheck'
import { invoiceIssues } from '../lib/checks'

const TABS = ['Details', 'Payments', 'Log', 'Notes'] as const

export default function InvoiceDetail() {
  const { id } = useParams()
  const { db, saveInvoice, recordPayment, addCredit, openTab } = useStore()
  const [sp] = useSearchParams()
  const inv = db.invoices.find((i) => i.id === Number(id))
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS.find((x) => x === sp.get('tab')) ?? 'Details')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Bank transfer')
  const [creditAmt, setCreditAmt] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [creditErr, setCreditErr] = useState('')

  useEffect(() => {
    if (inv) openTab({ path: `/invoices/${inv.id}`, title: `Invoice #${inv.id}` })
  }, [inv?.id, openTab]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!inv) return <p>Invoice not found.</p>

  const customer = db.customers.find((c) => c.id === inv.customerId)
  const site = db.sites.find((s) => s.id === inv.siteId)
  const t = invoiceTotals(inv)
  const st = invoiceState(inv)
  const locked = inv.stage !== 'draft' || inv.voided

  const pay = () => {
    const n = Number(amount)
    if (!(n > 0)) return
    if (n > t.balance + 0.005 && !confirm('This payment is more than the balance due. Record it anyway?')) return
    recordPayment(inv.id, { amount: n, date: new Date().toISOString().slice(0, 10), method })
    setAmount('')
  }

  const issueCredit = () => {
    const n = Number(creditAmt)
    if (!(n > 0)) return setCreditErr('Enter a credit amount above zero.')
    if (n > t.balance + 0.005) return setCreditErr('A credit cannot be more than the balance due.')
    if (!creditReason.trim()) return setCreditErr('Give a reason for the credit.')
    addCredit(inv.id, n, creditReason.trim())
    setCreditAmt('')
    setCreditReason('')
    setCreditErr('')
  }

  return (
    <>
      <div className="row between">
        <h1>Invoice #{inv.id}</h1>
        <div className="row">
          <Link className="btn" to={`/invoices/${inv.id}/print`}>Print / PDF</Link>
          <span className="pill">Total: {money(t.total)}</span>
          <span className="pill">Balance due: {money(t.balance)}</span>
          {inv.stage === 'draft' && !inv.voided && (
            <button className="primary" onClick={() => saveInvoice(withLog({ ...inv, stage: 'approved' }, 'Invoice approved'))}>Approve</button>
          )}
          {inv.stage !== 'draft' && !inv.voided && (
            <button onClick={() => confirm('Unlock this invoice for editing?') && saveInvoice(withLog({ ...inv, stage: 'draft' }, 'Invoice unlocked for editing'))}>Unlock</button>
          )}
          {!inv.voided && t.paid === 0 && (
            <button onClick={() => confirm('Void this invoice?') && saveInvoice(withLog({ ...inv, voided: true }, 'Invoice voided'))}>Void</button>
          )}
        </div>
      </div>

      {inv.stage === 'draft' && !inv.voided && <PreSendCheck issues={invoiceIssues(db, inv)} />}

      <div className="subtabs">
        {TABS.map((x) => <button key={x} className={x === tab ? 'active' : ''} onClick={() => setTab(x)}>{x}</button>)}
      </div>

      {tab === 'Details' && (
        <>
          <div className="strip">
            <div><small>Company</small><br />{customer && <Link to={`/customers/${customer.id}`}>{customer.name}</Link>}</div>
            <div><small>Site</small><br />{site?.name}</div>
            <div><small>Job</small><br />{inv.jobId || '–'}</div>
            <div><small>Issued</small><br />{inv.issuedAt}</div>
            <div><small>Payment due</small><br />
              <input type="date" value={inv.dueAt} disabled={locked} onChange={(e) => saveInvoice({ ...inv, dueAt: e.target.value })} />
            </div>
            <div><small>Stage</small><br />{inv.stage}</div>
            <div><small>Retainage %</small><br />
              <input type="number" min="0" max="100" step="1" value={inv.retainagePct ?? 0} disabled={locked}
                onChange={(e) => saveInvoice({ ...inv, retainagePct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
            </div>
            <div><small>Status</small><br /><i className="dot" style={{ background: STATE_COLOR[st] }} />{STATE_LABEL[st]}</div>
          </div>

          {inv.sections.map((s) => {
            const sub = s.items.reduce((a, i) => a + i.quantity * i.unitSell, 0)
            return (
              <div key={s.id} className="card">
                <button className="link-btn" onClick={() => setCollapsed({ ...collapsed, [s.id]: !collapsed[s.id] })}>
                  {collapsed[s.id] ? '▸' : '▾'} <b>{s.name}</b>
                </button>
                {!collapsed[s.id] && (
                  <table>
                    <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Total</th></tr></thead>
                    <tbody>
                      {s.items.map((i) => (
                        <tr key={i.id}>
                          <td>{i.description}{i.kind === 'labour' ? ` (${i.quantity} hrs)` : ''}</td>
                          <td className="num">{i.quantity}</td>
                          <td className="num">{money(i.unitSell)}</td>
                          <td className="num">{money(i.quantity * i.unitSell)}</td>
                        </tr>
                      ))}
                      <tr className="hl"><td colSpan={3}>Sub-total</td><td className="num">{money(sub)}</td></tr>
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}

          <table className="totals">
            <tbody>
              {inv.discount > 0 && <tr><td>Discount</td><td className="num">-{money(inv.discount)}</td></tr>}
              <tr><td>Sub-total</td><td className="num">{money(t.subTotal)}</td></tr>
              <tr><td>Tax ({inv.taxRate}%)</td><td className="num">{money(t.tax)}</td></tr>
              <tr className="hl"><td>Total</td><td className="num">{money(t.total)}</td></tr>
              <tr><td>Paid</td><td className="num">{money(t.paid)}</td></tr>
              {t.credited > 0 && <tr><td>Credits</td><td className="num">-{money(t.credited)}</td></tr>}
              <tr className="hl"><td>Balance due</td><td className="num">{money(t.balance)}</td></tr>
            </tbody>
          </table>
        {db.settings.invoiceFooter && <p className="muted" style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>{db.settings.invoiceFooter}</p>}
        </>
      )}

      {tab === 'Payments' && (
        <>
          {!inv.voided && (
            <div className="card row">
              <input type="number" min="0" step="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {['Bank transfer', 'Card', 'Cash', 'Cheque'].map((m) => <option key={m}>{m}</option>)}
              </select>
              <button className="primary" onClick={pay}>Record payment</button>
            </div>
          )}
          <table>
            <thead><tr><th>Date</th><th>Method</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {inv.payments.map((p) => (
                <tr key={p.id}><td>{p.date}</td><td>{p.method}</td><td className="num">{money(p.amount)}</td></tr>
              ))}
              {inv.payments.length === 0 && <tr><td colSpan={3} className="muted">No payments recorded.</td></tr>}
            </tbody>
          </table>

          <h3 style={{ marginTop: 20 }}>Credits</h3>
          {!inv.voided && t.balance > 0.005 && (
            <div className="card row wrap">
              <input type="number" min="0" step="0.01" placeholder="Credit amount" value={creditAmt} onChange={(e) => setCreditAmt(e.target.value)} />
              <input className="grow" placeholder="Reason" value={creditReason} onChange={(e) => setCreditReason(e.target.value)} />
              <button onClick={issueCredit}>Issue credit</button>
            </div>
          )}
          {creditErr && <p className="error">{creditErr}</p>}
          <table>
            <thead><tr><th>Date</th><th>Reason</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {(inv.credits ?? []).map((c) => (
                <tr key={c.id}><td>{c.date}</td><td>{c.reason}</td><td className="num">{money(c.amount)}</td></tr>
              ))}
              {(inv.credits ?? []).length === 0 && <tr><td colSpan={3} className="muted">No credits issued.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {tab === 'Log' && (
        <table>
          <thead><tr><th>When</th><th>Event</th></tr></thead>
          <tbody>
            {(inv.log ?? []).map((l) => (
              <tr key={l.id}><td>{new Date(l.at).toLocaleString()}</td><td>{l.message}</td></tr>
            ))}
            {(inv.log ?? []).length === 0 && <tr><td colSpan={2} className="muted">No activity recorded yet.</td></tr>}
          </tbody>
        </table>
      )}

      {tab === 'Notes' && (
        <div className="card">
          <p className="muted">Internal notes. These are not shown to the customer. Saved when you click away.</p>
          <textarea key={inv.notes ?? ''} rows={6} defaultValue={inv.notes ?? ''} onBlur={(e) => e.target.value !== (inv.notes ?? '') && saveInvoice({ ...inv, notes: e.target.value })} />
          <AiPolish kind="job_summary" text={inv.notes ?? ''} onAccept={(t) => saveInvoice({ ...inv, notes: t })} />
        </div>
      )}
    </>
  )
}
