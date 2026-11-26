import { useEffect, useState } from 'react'
import { decideQuote, loadQuotePortal } from '../lib/portal'
import type { PortalData } from '../lib/portal'
import { auDate, companyBlock, makePdf, quoteDocFrom } from '../lib/docs'
import type { DocModel } from '../lib/docs'
import { money } from '../lib/costing'
import SharedFiles from '../components/SharedFiles'

// The page a customer opens from "accept online" (/q/<token>). No sign-in, no app chrome:
// the quote at selling prices, a PDF download, and accept (typed name) or decline (optional reason).
export default function QuotePortal({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true
    loadQuotePortal(token).then((d) => { if (live) setData(d) }, (e: Error) => { if (live) setLoadErr(e.message) })
    return () => { live = false }
  }, [token, reload])

  if (loadErr) return <Frame><div className="qp-card"><h2>Something went wrong</h2><p>{loadErr}</p><button onClick={() => { setLoadErr(''); setReload((n) => n + 1) }}>Try again</button></div></Frame>
  if (!data) return <Frame><p className="muted center">Loading your quote…</p></Frame>
  if (data.state !== 'ok' || !data.quote || !data.company) {
    const why = { not_found: 'This link is not valid. Check that you copied the whole link from the email.', revoked: 'This quote link has been withdrawn. Please contact us for an updated quote.', expired: 'This quote link has expired. Please contact us for an updated quote.', ok: '' }[data.state]
    return <Frame><div className="qp-card"><h2>Quote not available</h2><p>{why}</p></div></Frame>
  }

  const q = data.quote
  const doc = quoteDocFrom({
    company: companyBlock({ ...data.company, tradingName: data.company.name }, data.company.name),
    id: q.id, name: q.name, description: q.description, created: q.date, discount: Number(q.discount), taxRate: Number(q.taxRate),
    sections: q.sections.map((s) => ({ name: s.name, items: s.items.map((i) => ({ ...i, quantity: Number(i.quantity), unitSell: Number(i.unitSell) })) })),
    customer: data.customer ?? { name: '' },
    site: data.site ?? null,
  })
  const total = doc.totals.find((t) => t.strong)?.value ?? ''
  return (
    <Frame company={data.company.name}>
      <Decision token={token} data={data} total={total} onDone={() => setReload((n) => n + 1)} />
      {data.attachments?.length ? <div className="qp-card"><SharedFiles files={data.attachments} /></div> : null}
      <DocView doc={doc} />
      <p className="muted qp-foot">Questions? {[data.company.phone && `Call ${data.company.phone}`, data.company.email && `email ${data.company.email}`].filter(Boolean).join(' or ') || 'Contact us'}.</p>
    </Frame>
  )
}

function Frame({ company, children }: { company?: string; children: React.ReactNode }) {
  return (
    <div className="qp">
      <header className="qp-top"><b>{company ?? 'Quote'}</b></header>
      <main className="qp-main">{children}</main>
    </div>
  )
}

function Decision({ token, data, total, onDone }: { token: string; data: PortalData; total: string; onDone: () => void }) {
  const q = data.quote!
  const link = data.link
  const [name, setName] = useState('')
  const [agree, setAgree] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (link?.decision || q.status === 'approved' || q.status === 'declined') {
    const accepted = link?.decision ? link.decision === 'accepted' : q.status === 'approved'
    return (
      <div className={`qp-card qp-done ${accepted ? 'ok' : 'no'}`} role="status">
        <h2>{accepted ? 'Quote accepted' : 'Quote declined'}</h2>
        <p>{link?.decision
          ? `${accepted ? 'Accepted' : 'Declined'} by ${link.signerName} on ${auDate(link.decidedAt)}. ${accepted ? 'Thank you. We will be in touch to book the work.' : 'Thank you for letting us know.'}`
          : `This quote has already been marked as ${accepted ? 'accepted' : 'declined'}. Contact us if anything has changed.`}</p>
        <PdfButton data={data} />
      </div>
    )
  }

  const submit = async (decision: 'accepted' | 'declined') => {
    if (decision === 'accepted' && !agree) return setErr('Tick the box to confirm you accept the quote.')
    setBusy(true); setErr('')
    const e = await decideQuote(token, decision, name, note)
    setBusy(false)
    if (e) return setErr(e)
    onDone()
  }

  return (
    <div className="qp-card">
      <h2>Quote #{q.id}: {q.name}</h2>
      <p className="qp-total">Total {total} <span className="muted">inc GST</span></p>
      {link?.expiresAt && <p className="muted">You can respond online until {auDate(link.expiresAt)}.</p>}
      <label className="block">Your full name
        <input className="wide" autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); setErr('') }} placeholder="e.g. Tom Bixler" />
      </label>
      {!declining ? (
        <>
          <label className="block qp-agree"><input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErr('') }} /> I accept quote #{q.id} for {total} including GST, and typing my name above is my signature.</label>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="row wrap">
            <button className="primary" disabled={busy} onClick={() => void submit('accepted')}>{busy ? 'Saving…' : 'Accept quote'}</button>
            <button className="link-btn" onClick={() => { setDeclining(true); setErr('') }}>Decline instead</button>
            <PdfButton data={data} />
          </div>
        </>
      ) : (
        <>
          <label className="block">Reason (optional)
            <textarea className="wide" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Let us know why, so we can help" />
          </label>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="row wrap">
            <button disabled={busy} onClick={() => void submit('declined')}>{busy ? 'Saving…' : 'Decline quote'}</button>
            <button className="link-btn" onClick={() => { setDeclining(false); setErr('') }}>Back</button>
          </div>
        </>
      )}
    </div>
  )
}

function PdfButton({ data }: { data: PortalData }) {
  const [busy, setBusy] = useState(false)
  const q = data.quote!
  const go = async () => {
    setBusy(true)
    try {
      const doc = quoteDocFrom({
        company: companyBlock({ ...data.company!, tradingName: data.company!.name }, data.company!.name),
        id: q.id, name: q.name, description: q.description, created: q.date, discount: Number(q.discount), taxRate: Number(q.taxRate),
        sections: q.sections.map((s) => ({ name: s.name, items: s.items.map((i) => ({ ...i, quantity: Number(i.quantity), unitSell: Number(i.unitSell) })) })),
        customer: data.customer ?? { name: '' }, site: data.site ?? null,
      })
      const { downloadPdf } = await import('../lib/pdf')
      downloadPdf(await makePdf(doc), doc.fileName)
    } finally { setBusy(false) }
  }
  return <button disabled={busy} onClick={() => void go()}>{busy ? 'Creating PDF…' : 'Download PDF'}</button>
}

// A DocModel drawn as HTML, using the same look as the printable documents.
function DocView({ doc }: { doc: DocModel }) {
  return (
    <article className="doc qp-doc">
      <header className="doc-head">
        <div><h2>{doc.company.name}</h2>{doc.company.lines.map((l) => <div key={l}>{l}</div>)}</div>
        <div className="doc-title">
          <h1>{doc.title}</h1><div className="doc-no">#{doc.number}</div>
          <table className="doc-meta"><tbody>{doc.meta.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
        </div>
      </header>
      <div className="doc-parties">
        <div><h4>Bill to</h4><b>{doc.billTo.name}</b>{doc.billTo.lines.map((l) => <div key={l}>{l}</div>)}</div>
        {doc.site && <div><h4>Job site</h4><b>{doc.site.name}</b>{doc.site.lines.map((l) => <div key={l}>{l}</div>)}</div>}
      </div>
      {doc.heading && <h3 className="doc-job">{doc.heading}</h3>}
      {doc.scope && <p className="doc-scope">{doc.scope}</p>}
      <table className="doc-table">
        <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {doc.sections.flatMap((s, si) => [
            ...(doc.sections.length > 1 ? [<tr key={`s${si}`} className="doc-section"><td colSpan={4}>{s.name}</td></tr>] : []),
            ...s.items.map((i, ii) => <tr key={`${si}-${ii}`}><td>{i.description}</td><td className="num">{i.qty}</td><td className="num">{money(i.unit)}</td><td className="num">{money(i.amount)}</td></tr>),
          ])}
        </tbody>
      </table>
      <table className="doc-totals"><tbody>{doc.totals.map((t) => <tr key={t.label} className={t.strong ? 'doc-grand' : ''}><td>{t.label}</td><td>{t.value}</td></tr>)}</tbody></table>
      {doc.footer.map((f) => <p key={f} className="doc-foot">{f}</p>)}
    </article>
  )
}
