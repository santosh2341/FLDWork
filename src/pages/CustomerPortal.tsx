import { useEffect, useState } from 'react'
import { loadCustomerPortal } from '../lib/portal'
import type { AccountData } from '../lib/portal'
import { auDate, companyBlock, invoiceDocFrom, makePdf, quoteDocFrom, sellTotals } from '../lib/docs'
import type { DocModel } from '../lib/docs'
import { money, STATUS_LABEL } from '../lib/costing'
import { today } from '../lib/dates'

type Quo = NonNullable<AccountData['quotes']>[number]
const num = (n: unknown) => Number(n ?? 0)

// The customer's own page (/p/<token>): what they owe, their invoices and quotes, a statement and how to pay.
// Read-only, no sign-in, selling prices only.
export default function CustomerPortal({ token }: { token: string }) {
  const [data, setData] = useState<AccountData | null>(null)
  const [err, setErr] = useState('')
  const [retry, setRetry] = useState(0)
  const [tab, setTab] = useState<'invoices' | 'quotes' | 'statement'>('invoices')

  useEffect(() => {
    let live = true
    loadCustomerPortal(token).then((d) => { if (live) setData(d) }, (e: Error) => { if (live) setErr(e.message) })
    return () => { live = false }
  }, [token, retry])

  if (err) return <Shell><div className="qp-card"><h2>Something went wrong</h2><p>{err}</p><button onClick={() => { setErr(''); setRetry((n) => n + 1) }}>Try again</button></div></Shell>
  if (!data) return <Shell><p className="muted center">Loading your account…</p></Shell>
  if (data.state !== 'ok' || !data.company || !data.customer) {
    const why = { not_found: 'This link is not valid. Check that you copied the whole link.', revoked: 'This link has been withdrawn. Please contact us for a new one.', expired: 'This link has expired. Please contact us for a new one.', ok: '' }[data.state]
    return <Shell><div className="qp-card"><h2>Account not available</h2><p>{why}</p></div></Shell>
  }

  const co = data.company
  const company = companyBlock({ ...co, tradingName: co.name }, co.name)
  const pay = co.bsb || co.accountNumber ? [[co.accountName, co.bankName].filter(Boolean).join(' · '), `BSB ${co.bsb} · Account ${co.accountNumber}`].filter(Boolean) : []
  const invoices = (data.invoices ?? []).map((i) => {
    const sections = i.sections.map((s) => ({ name: s.name, items: s.items.map((x) => ({ ...x, quantity: num(x.quantity), unitSell: num(x.unitSell) })) }))
    const t = sellTotals(sections, num(i.discount), num(i.taxRate))
    const paid = i.payments.reduce((a, p) => a + num(p.amount), 0)
    const credited = i.credits.reduce((a, c) => a + num(c.amount), 0)
    return { i, sections, total: t.total, paid, credited, balance: t.total - paid - credited }
  })
  const owing = invoices.reduce((a, r) => a + Math.max(0, r.balance), 0)
  const overdue = invoices.filter((r) => r.balance > 0.005 && r.i.dueAt < today())
  const quotes = data.quotes ?? []
  const openQuotes = quotes.filter((q) => q.acceptToken)

  const invoiceDoc = (r: (typeof invoices)[number]): DocModel => invoiceDocFrom({
    company, abn: co.abn, id: r.i.id, issuedAt: r.i.issuedAt, dueAt: r.i.dueAt, job: r.i.job, taxRate: num(r.i.taxRate), discount: num(r.i.discount),
    claimLabel: r.i.claimLabel, claimPct: r.i.claimPct == null ? null : num(r.i.claimPct), sections: r.sections, paid: r.paid, credited: r.credited,
    customer: data.customer!, site: r.i.site?.name ? { name: r.i.site.name, address: r.i.site.address } : null,
    pay: pay.length ? [...pay.slice(0, 1), `${pay[pay.length - 1]} · Reference ${r.i.id}`] : [], footer: co.invoiceFooter,
  })
  const quoteDoc = (q: Quo): DocModel => quoteDocFrom({
    company, id: q.id, name: q.name, description: q.description, created: q.date, discount: num(q.discount), taxRate: num(q.taxRate),
    sections: q.sections.map((s) => ({ name: s.name, items: s.items.map((x) => ({ ...x, quantity: num(x.quantity), unitSell: num(x.unitSell) })) })),
    customer: data.customer!, site: q.site?.name ? { name: q.site.name, address: q.site.address } : null,
  })

  return (
    <Shell company={co.name}>
      <div className="qp-card cp-summary">
        <h2>{data.customer.name}</h2>
        <div className="cp-stats">
          <div><span className="muted">Balance owing</span><b>{money(owing)}</b>{overdue.length > 0 && <span className="jc-over">{overdue.length} overdue</span>}</div>
          <div><span className="muted">Invoices</span><b>{invoices.length}</b></div>
          <div><span className="muted">Quotes awaiting your answer</span><b>{openQuotes.length}</b></div>
        </div>
        {pay.length > 0 && owing > 0.005 && (
          <div className="cp-pay"><b>Pay by bank transfer</b>{pay.map((l) => <div key={l}>{l}</div>)}<div className="muted">Use the invoice number as the reference.</div></div>
        )}
      </div>

      <div className="subtabs cp-tabs" role="tablist">
        {(['invoices', 'quotes', 'statement'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'invoices' ? `Invoices (${invoices.length})` : t === 'quotes' ? `Quotes (${quotes.length})` : 'Statement'}
          </button>
        ))}
      </div>

      {tab === 'invoices' && (
        <div className="cp-list">
          {invoices.length === 0 && <p className="muted">No invoices yet.</p>}
          {invoices.map((r) => {
            const late = r.balance > 0.005 && r.i.dueAt < today()
            return (
              <div key={r.i.id} className={`qp-card cp-item ${r.balance <= 0.005 ? 'paid' : late ? 'late' : ''}`}>
                <div className="row between wrap">
                  <div>
                    <b>Invoice #{r.i.id}</b>{r.i.job && <span className="muted"> · {r.i.job}</span>}
                    <div className="muted">Issued {auDate(r.i.issuedAt)} · due {auDate(r.i.dueAt)}</div>
                  </div>
                  <div className="cp-amt">
                    <b>{r.balance <= 0.005 ? 'Paid' : `${money(r.balance)} owing`}</b>
                    <span className="muted">of {money(r.total)}{late ? ' · overdue' : ''}</span>
                  </div>
                </div>
                <PdfButton make={() => invoiceDoc(r)} />
              </div>
            )
          })}
        </div>
      )}

      {tab === 'quotes' && (
        <div className="cp-list">
          {quotes.length === 0 && <p className="muted">No quotes yet.</p>}
          {quotes.map((q) => {
            const doc = quoteDoc(q)
            return (
              <div key={q.id} className={`qp-card cp-item ${q.status === 'approved' ? 'paid' : q.status === 'declined' ? 'late' : ''}`}>
                <div className="row between wrap">
                  <div><b>Quote #{q.id}</b> <span className="muted">· {q.name}</span><div className="muted">{auDate(q.date)} · {STATUS_LABEL[q.status] === 'Approved' ? 'Accepted' : STATUS_LABEL[q.status] ?? q.status}</div></div>
                  <div className="cp-amt"><b>{doc.totals.find((t) => t.strong)?.value}</b><span className="muted">inc GST</span></div>
                </div>
                <div className="row wrap">
                  {q.acceptToken && <a className="btn primary" href={`/q/${q.acceptToken}`}>View and accept</a>}
                  <PdfButton make={() => doc} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'statement' && (
        <article className="doc qp-doc">
          <header className="doc-head">
            <div><h2>{company.name}</h2>{company.lines.map((l) => <div key={l}>{l}</div>)}</div>
            <div className="doc-title"><h1>STATEMENT</h1><table className="doc-meta"><tbody><tr><td>Date</td><td>{auDate(today())}</td></tr></tbody></table></div>
          </header>
          <div className="doc-parties"><div><h4>Customer</h4><b>{data.customer.name}</b>{data.customer.contactName && <div>Attn: {data.customer.contactName}</div>}</div><div /></div>
          <table className="doc-table">
            <thead><tr><th>Invoice</th><th>Due</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {[...invoices].reverse().map((r) => (
                <tr key={r.i.id}><td>#{r.i.id}</td><td>{auDate(r.i.dueAt)}{r.balance > 0.005 && r.i.dueAt < today() ? ' (overdue)' : ''}</td><td className="num">{money(r.total)}</td><td className="num">{money(r.paid + r.credited)}</td><td className="num">{money(r.balance)}</td></tr>
              ))}
              {invoices.length === 0 && <tr><td colSpan={5}>No invoices have been issued.</td></tr>}
            </tbody>
          </table>
          <table className="doc-totals"><tbody><tr className="doc-grand"><td>Total owing (inc GST)</td><td>{money(owing)}</td></tr></tbody></table>
          {pay.length > 0 && <p className="doc-foot">Pay by bank transfer: {pay.join(' · ')}</p>}
          <div className="no-print"><button onClick={() => window.print()}>Print statement</button></div>
        </article>
      )}

      <p className="muted qp-foot">Questions? {[co.phone && `Call ${co.phone}`, co.email && `email ${co.email}`].filter(Boolean).join(' or ') || 'Contact us'}.{data.expiresAt ? ` This page works until ${auDate(data.expiresAt)}.` : ''}</p>
    </Shell>
  )
}

function Shell({ company, children }: { company?: string; children: React.ReactNode }) {
  return (
    <div className="qp">
      <header className="qp-top no-print"><b>{company ?? 'Your account'}</b></header>
      <main className="qp-main">{children}</main>
    </div>
  )
}

function PdfButton({ make }: { make: () => DocModel }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const go = async () => {
    setBusy(true); setFailed(false)
    try {
      const doc = make()
      const { downloadPdf } = await import('../lib/pdf')
      downloadPdf(await makePdf(doc), doc.fileName)
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  return <>{failed && <span className="error">Could not create the PDF.</span>}<button disabled={busy} onClick={() => void go()}>{busy ? 'Creating PDF…' : 'Download PDF'}</button></>
}

