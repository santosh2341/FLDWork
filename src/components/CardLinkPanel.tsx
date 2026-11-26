import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { money } from '../lib/costing'
import { cardPaymentsEnabled, startCardPayment } from '../lib/payments'

// Invoice → Payments: make a Stripe card payment link for the balance, to send to the customer.
// When they pay, the stripe-webhook function records the payment here automatically.
export default function CardLinkPanel({ invoiceId, balance }: { invoiceId: number; balance: number }) {
  const { remote, canWrite } = useStore()
  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let live = true
    if (remote) void cardPaymentsEnabled().then((on) => { if (live) setEnabled(on) })
    return () => { live = false }
  }, [remote])

  if (!remote || !canWrite || balance < 0.5) return null
  if (!enabled) return <p className="muted card-link-off">Card payments are not switched on. An admin adds the Stripe secrets in Supabase to offer "Pay by card".</p>

  const create = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await startCardPayment({ invoiceId })
      setUrl(r.url)
      try { await navigator.clipboard.writeText(r.url); setMsg({ ok: true, text: `Link for ${money(r.amount)} copied. It works for 24 hours.` }) }
      catch { setMsg({ ok: true, text: `Link for ${money(r.amount)} ready. Copy it below; it works for 24 hours.` }) }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not create the link.' })
    }
    setBusy(false)
  }

  return (
    <div className="card qlink">
      <div className="row between wrap">
        <div>
          <b>Card payment</b>
          <div className="muted">Send the customer a secure Stripe link to pay the {money(balance)} owing. Paid amounts are recorded here automatically. Stripe links work for 24 hours; for a link that lasts, email the invoice (it includes a "View and pay online" button).</div>
        </div>
        <button className="primary" disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : url ? 'New link' : 'Create payment link'}</button>
      </div>
      {url && <input className="wide qlink-url" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Card payment link" />}
      {msg && <p className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  )
}
