import { useState } from 'react'
import { useStore } from '../store'
import { activeLink, linkState, linkUrl } from '../lib/quoteLinks'
import { auDate } from '../lib/docs'
import type { Quote } from '../types'

// Quote screen: create and track the customer's "accept online" link.
export default function QuoteLinkPanel({ quote }: { quote: Quote }) {
  const { db, canWrite, profile, createQuoteLink, revokeQuoteLink } = useStore()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const links = (db.quoteLinks ?? []).filter((l) => l.quoteId === quote.id)
  const live = activeLink(db.quoteLinks, quote.id)
  const decided = links.find((l) => l.decision)
  if (!canWrite) return null

  const create = async () => {
    setBusy(true); setMsg(null)
    const r = await createQuoteLink(quote.id, profile?.fullName ?? '')
    setBusy(false)
    if (r.error || !r.token) return setMsg({ ok: false, text: r.error ?? 'Could not create the link.' })
    await copy(linkUrl(r.token))
  }
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setMsg({ ok: true, text: 'Link copied. Paste it into an email or text message.' }) }
    catch { setMsg({ ok: true, text: 'Select the link and copy it.' }) }
  }
  const revoke = async (token: string) => {
    setBusy(true)
    const err = await revokeQuoteLink(token)
    setBusy(false)
    setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Link withdrawn. The customer can no longer open it.' })
  }

  return (
    <div className="card no-print qlink">
      <div className="row between wrap">
        <div>
          <b>Accept online</b>
          <div className="muted">
            {decided ? `${decided.decision === 'accepted' ? 'Accepted' : 'Declined'} online by ${decided.signerName} on ${auDate(decided.decidedAt)}${decided.signerNote ? `: “${decided.signerNote}”` : ''}`
              : live ? `Link active until ${auDate(live.expiresAt)} · ${live.viewCount ? `opened ${live.viewCount} time${live.viewCount === 1 ? '' : 's'}, last ${auDate(live.lastViewedAt)}` : 'not opened yet'}`
              : quote.status === 'approved' || quote.status === 'declined' ? `This quote is already ${quote.status}.`
              : 'Send the customer a private link to view this quote and accept or decline it, no sign-in needed.'}
          </div>
        </div>
        <div className="row">
          {live && <button onClick={() => void copy(linkUrl(live.token))}>Copy link</button>}
          {live && <button className="link-btn" disabled={busy} onClick={() => void revoke(live.token)}>Withdraw link</button>}
          {!live && !decided && quote.status !== 'approved' && quote.status !== 'declined' && (
            <button className="primary" disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create link'}</button>
          )}
        </div>
      </div>
      {live && <input className="wide qlink-url" readOnly value={linkUrl(live.token)} onFocus={(e) => e.target.select()} aria-label="Customer link" />}
      {msg && <p className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      {links.length > (live ? 1 : 0) && (
        <details className="qlink-history">
          <summary className="muted">Earlier links ({links.filter((l) => l !== live).length})</summary>
          <ul className="plain">{links.filter((l) => l !== live).map((l) => <li key={l.token} className="muted">Created {auDate(l.createdAt)}{l.createdBy ? ` by ${l.createdBy}` : ''}: {linkState(l)}</li>)}</ul>
        </details>
      )}
    </div>
  )
}
