import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { sendDocument, sentHistory } from '../lib/email'
import type { SentRecord } from '../lib/email'

// "Email to customer": sends the document to the customer's email on file (database mode only).
export default function EmailPanel({ kind, id, to, defaultSubject, defaultMessage }: { kind: 'quote' | 'invoice'; id: number; to?: string; defaultSubject: string; defaultMessage: string }) {
  const { remote, canWrite } = useStore()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState(defaultSubject)
  const [message, setMessage] = useState(defaultMessage)
  const [copyMe, setCopyMe] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [history, setHistory] = useState<SentRecord[]>([])

  useEffect(() => { if (remote) void sentHistory(kind, id).then(setHistory) }, [remote, kind, id])
  if (!remote || !canWrite) return null

  const send = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await sendDocument({ kind, id, subject, message, copyMe })
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
          <label><input type="checkbox" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} /> Send me a copy</label>
          <div className="row" style={{ marginTop: 8 }}><button className="primary" disabled={busy || !subject.trim()} onClick={() => void send()}>{busy ? 'Sending…' : 'Send email'}</button></div>
        </div>
      )}
      {msg && <p className={msg.ok ? '' : 'error'}>{msg.text}</p>}
    </div>
  )
}
