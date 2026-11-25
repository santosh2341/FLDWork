import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { sendDocument, sentHistory } from '../lib/email'
import type { SentRecord } from '../lib/email'
import { makePdf } from '../lib/docs'
import type { DocModel } from '../lib/docs'
import { activeLink } from '../lib/quoteLinks'

// "Email to customer": sends the document to the customer's email on file (database mode only),
// with the PDF attached and, for quotes, a link to accept online.
export default function EmailPanel({ kind, id, to, defaultSubject, defaultMessage, doc }: {
  kind: 'quote' | 'invoice'; id: number; to?: string; defaultSubject: string; defaultMessage: string; doc?: DocModel
}) {
  const { remote, canWrite, db, profile, createQuoteLink } = useStore()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState(defaultSubject)
  const [message, setMessage] = useState(defaultMessage)
  const [copyMe, setCopyMe] = useState(true)
  const [attach, setAttach] = useState(true)
  const [withLink, setWithLink] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [history, setHistory] = useState<SentRecord[]>([])
  const quote = kind === 'quote' ? db.quotes.find((q) => q.id === id) : undefined
  const decided = quote?.status === 'approved' || quote?.status === 'declined'

  useEffect(() => { if (remote) void sentHistory(kind, id).then(setHistory) }, [remote, kind, id])
  if (!remote || !canWrite) return null

  const send = async () => {
    setBusy(true)
    setMsg(null)
    try {
      let pdf: string | undefined
      if (attach && doc) {
        const { toBase64 } = await import('../lib/pdf')
        pdf = toBase64(await makePdf(doc))
      }
      let linkToken: string | undefined
      if (kind === 'quote' && withLink && !decided) {
        linkToken = activeLink(db.quoteLinks, id)?.token
        if (!linkToken) {
          const r = await createQuoteLink(id, profile?.fullName ?? '')
          if (r.error) throw new Error(r.error)
          linkToken = r.token
        }
      }
      const r = await sendDocument({ kind, id, subject, message, copyMe, pdf, linkToken })
      setMsg({ ok: true, text: `Sent to ${r.to}.` })
      setHistory(await sentHistory(kind, id))
      setOpen(false)
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not send.' })
    }
    setBusy(false)
  }

  return (
    <div className="card no-print email-panel">
      <div className="row between">
        <div>
          <b>Email this {kind}</b>
          <div className="muted">{to ? `To ${to}` : 'This customer has no email address on file. Add one on the customer page.'}</div>
          {history[0] && <div className="muted">Last sent to {history[0].to} on {new Date(history[0].at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div>}
        </div>
        <button className="primary" disabled={!to} onClick={() => setOpen(!open)}>{open ? 'Close' : 'Write email'}</button>
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          <label className="block">Subject<br /><input className="wide" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label className="block">Message<br /><textarea className="wide" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
          <p className="muted">The {kind} itself (items, totals{kind === 'invoice' ? ', bank details' : ''}) is included below your message.</p>
          {doc && <label className="block"><input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} /> Attach the {kind} as a PDF ({doc.fileName})</label>}
          {kind === 'quote' && !decided && <label className="block"><input type="checkbox" checked={withLink} onChange={(e) => setWithLink(e.target.checked)} /> Include a link so the customer can accept or decline online</label>}
          <label className="block"><input type="checkbox" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} /> Send me a copy</label>
          <div className="row" style={{ marginTop: 8 }}><button className="primary" disabled={busy || !subject.trim()} onClick={() => void send()}>{busy ? 'Sending…' : 'Send email'}</button></div>
        </div>
      )}
      {msg && <p className={msg.ok ? '' : 'error'}>{msg.text}</p>}
    </div>
  )
}
