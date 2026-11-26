// Fieldwork: Stripe calls this when a Checkout payment completes; it records the payment on the invoice.
// The signature is checked with STRIPE_WEBHOOK_SECRET, so only Stripe can record payments. Recording is idempotent:
// the Checkout Session id is stored in payments.external_ref (unique), so a repeated event changes nothing.
// In the Stripe dashboard, send the event "checkout.session.completed" to this function's URL.
import { createClient } from 'npm:@supabase/supabase-js@2'

const ok = (msg = 'ok') => new Response(msg, { status: 200 })
const enc = new TextEncoder()

// Stripe-Signature: t=timestamp,v1=hex(HMAC_SHA256(secret, `${t}.${payload}`)). Allow 5 minutes of clock drift.
async function verify(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=', 2) as [string, string]))
  const t = Number(parts.t)
  const sigs = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3))
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > 300) return false
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`)))
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
  // constant-time comparison
  return sigs.some((s) => s.length === hex.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0)
}

const sydneyToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date()) // YYYY-MM-DD

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Use POST.', { status: 405 })
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!secret) return new Response('Not configured', { status: 503 })
  const payload = await req.text()
  if (!(await verify(payload, req.headers.get('stripe-signature') ?? '', secret))) return new Response('Bad signature', { status: 400 })

  const event = JSON.parse(payload)
  if (event.type !== 'checkout.session.completed') return ok('ignored')
  const s = event.data?.object ?? {}
  if (s.payment_status !== 'paid') return ok('not paid yet')
  const invoiceId = Number(s.metadata?.invoice_id)
  const companyId = String(s.metadata?.company_id ?? '')
  const amount = Number(s.amount_total) / 100
  if (!Number.isFinite(invoiceId) || !companyId || !(amount > 0) || String(s.currency).toLowerCase() !== 'aud') return ok('missing details')

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: inv, error: findErr } = await admin.from('invoices').select('id').eq('id', invoiceId).eq('company_id', companyId).maybeSingle()
  if (findErr) { // a database problem, not a missing invoice: answer non-2xx so Stripe retries later
    console.error('stripe-webhook: invoice lookup failed', findErr.message)
    return new Response('Could not look up invoice', { status: 500 })
  }
  if (!inv) { console.error('stripe-webhook: invoice not found', invoiceId, companyId); return ok('invoice not found') }
  const { error } = await admin.from('payments').insert({
    company_id: companyId, invoice_id: invoiceId, amount, date: sydneyToday(), method: 'Card (Stripe)', external_ref: String(s.id),
  })
  if (error && error.code !== '23505') { // 23505 = already recorded
    console.error('stripe-webhook: insert failed', error.message)
    return new Response('Could not record payment', { status: 500 }) // Stripe retries on non-2xx
  }
  return ok(error ? 'already recorded' : 'recorded')
})
