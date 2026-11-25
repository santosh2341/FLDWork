import { useState } from 'react'
import { useStore } from '../store'
import { auDate } from '../lib/docs'

// Customer screen: a private read-only portal link (/p/<token>) for this customer's invoices, quotes and statement.
export default function CustomerLinkPanel({ customerId }: { customerId: string }) {
  const { db, canWrite, profile, createCustomerLink, revokeCustomerLink } = useStore()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [now] = useState(() => Date.now())
  if (!canWrite) return null
  const live = (db.customerLinks ?? []).find((l) => l.customerId === customerId && !l.revokedAt && new Date(l.expiresAt).getTime() > now)
  const url = (t: string) => `${window.location.origin}/p/${t}`

  const copy = async (u: string) => {
    try { await navigator.clipboard.writeText(u); setMsg({ ok: true, text: 'Link copied. Send it to the customer by email or text.' }) }
    catch { setMsg({ ok: true, text: 'Select the link and copy it.' }) }
  }
  const create = async () => {
    setBusy(true); setMsg(null)
    const r = await createCustomerLink(customerId, profile?.fullName ?? '')
    setBusy(false)
    if (r.error || !r.token) return setMsg({ ok: false, text: r.error ?? 'Could not create the link.' })
    await copy(url(r.token))
  }
  const revoke = async (t: string) => {
    setBusy(true)
    const e = await revokeCustomerLink(t)
    setBusy(false)
    setMsg(e ? { ok: false, text: e } : { ok: true, text: 'Link withdrawn. The customer can no longer open it.' })
  }

  return (
    <div className="card qlink">
      <div className="row between wrap">
        <div>
          <b>Customer portal</b>
          <div className="muted">
            {live ? `Active until ${auDate(live.expiresAt)} · ${live.viewCount ? `opened ${live.viewCount} time${live.viewCount === 1 ? '' : 's'}, last ${auDate(live.lastViewedAt)}` : 'not opened yet'}`
              : 'A private page where this customer can see their invoices, quotes and statement, and download PDFs. No sign-in needed.'}
          </div>
        </div>
        <div className="row">
          {live ? <>
            <button onClick={() => void copy(url(live.token))}>Copy link</button>
            <button className="link-btn" disabled={busy} onClick={() => void revoke(live.token)}>Withdraw link</button>
          </> : <button className="primary" disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create portal link'}</button>}
        </div>
      </div>
      {live && <input className="wide qlink-url" readOnly value={url(live.token)} onFocus={(e) => e.target.select()} aria-label="Customer portal link" />}
      {msg && <p className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  )
}
