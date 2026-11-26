// Fieldwork: starts a Stripe Checkout payment for an invoice's balance and returns the Stripe page URL.
// Two callers:
//   - the customer portal (no sign-in): { portalToken, invoiceId } - the token must be an active portal link for the
//     invoice's customer
//   - office staff (signed in, can_write): { invoiceId } - returns a payment link to send to the customer
// GET returns { enabled } so the app only shows card payment once both Stripe secrets are set.
// The amount is always the balance worked out here from the database, never a number sent by the browser.
// Secrets: STRIPE_SECRET_KEY (sk_...), STRIPE_WEBHOOK_SECRET (whsec_..., used by stripe-webhook).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const TOKEN = /^[0-9a-f]{64}$/

interface Inv {
  id: number; company_id: string; customer_id: string; stage: string; voided: boolean; tax_rate: number; discount: number
  invoice_sections: { invoice_items: { quantity: number; unit_sell: number }[] }[]
  payments: { amount: number }[]; credits: { amount: number }[]
}
const balanceOf = (i: Inv) => {
  const gross = (i.invoice_sections ?? []).reduce((a, s) => a + (s.invoice_items ?? []).reduce((b, it) => b + Number(it.quantity) * Number(it.unit_sell), 0), 0)
  const total = (gross - Number(i.discount ?? 0)) * (1 + Number(i.tax_rate ?? 0) / 100)
  const paid = (i.payments ?? []).reduce((a, p) => a + Number(p.amount), 0) + (i.credits ?? []).reduce((a, c) => a + Number(c.amount), 0)
  return Math.round((total - paid) * 100) / 100
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const enabled = !!stripeKey && !!Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (req.method === 'GET') return json({ enabled })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  if (!enabled) return json({ error: 'Card payments are not set up yet.', code: 'not_configured' }, 503)
  try {
    const body = await req.json()
    const invoiceId = Number(body.invoiceId)
    if (!Number.isFinite(invoiceId)) return json({ error: 'Unknown invoice.' }, 400)
    const origin = (req.headers.get('origin') ?? Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
    if (!/^https?:\/\/[\w.-]+(:\d+)?$/.test(origin)) return json({ error: 'Open this from the Fieldwork app.' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const select = 'id, company_id, customer_id, stage, voided, tax_rate, discount, invoice_sections(invoice_items(quantity, unit_sell)), payments(amount), credits(amount)'
    let inv: Inv | null = null
    let successUrl = '', cancelUrl = ''

    if (typeof body.portalToken === 'string') {
      // customer portal: the link must be active and belong to this invoice's customer
      if (!TOKEN.test(body.portalToken)) return json({ error: 'This link is not valid.' }, 400)
      const { data: link, error: linkErr } = await admin.from('customer_links').select('company_id, customer_id, expires_at, revoked_at').eq('token', body.portalToken).maybeSingle()
      if (linkErr) { console.error('stripe-checkout: link lookup failed', linkErr.message); return json({ error: 'Could not check your link. Try again shortly.' }, 500) }
      if (!link || link.revoked_at || new Date(link.expires_at as string) < new Date()) return json({ error: 'This link is no longer active. Please contact us.' }, 403)
      const { data } = await admin.from('invoices').select(select).eq('id', invoiceId).eq('company_id', link.company_id).eq('customer_id', link.customer_id).maybeSingle()
      inv = data as Inv | null
      successUrl = `${origin}/p/${body.portalToken}?paid=${invoiceId}`
      cancelUrl = `${origin}/p/${body.portalToken}`
    } else {
      // office staff: signed in and allowed to write; the invoice must be visible to them
      const auth = req.headers.get('Authorization') ?? ''
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
      const { data: u } = await sb.auth.getUser()
      if (!u?.user) return json({ error: 'Please sign in again.', code: 'auth' }, 401)
      const { data: canWrite } = await sb.rpc('can_write')
      if (!canWrite) return json({ error: 'Your role cannot create payment links.' }, 403)
      const { data } = await sb.from('invoices').select(select).eq('id', invoiceId).maybeSingle()
      inv = data as Inv | null
      successUrl = `${origin}/paid?invoice=${invoiceId}`
      cancelUrl = `${origin}/paid?invoice=${invoiceId}&cancelled=1`
    }

    if (!inv) return json({ error: 'Invoice not found.' }, 404)
    if (inv.voided || inv.stage === 'draft') return json({ error: inv.voided ? 'This invoice is voided.' : 'This invoice has not been issued yet.' }, 400)
    const balance = balanceOf(inv)
    if (balance < 0.5) return json({ error: 'Nothing is owing on this invoice.' }, 400)

    const { data: co } = await admin.from('companies').select('name, profile').eq('id', inv.company_id).single()
    const company = ((co?.profile ?? {}) as Record<string, string>).tradingName || co?.name || 'Fieldwork'

    const form = new URLSearchParams({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'aud',
      'line_items[0][price_data][unit_amount]': String(Math.round(balance * 100)),
      'line_items[0][price_data][product_data][name]': `Invoice #${inv.id}`,
      'line_items[0][price_data][product_data][description]': `${company} - balance owing (inc GST)`,
      'metadata[invoice_id]': String(inv.id),
      'metadata[company_id]': inv.company_id,
      'payment_intent_data[metadata][invoice_id]': String(inv.id),
      'payment_intent_data[description]': `${company} invoice #${inv.id}`,
      client_reference_id: String(inv.id),
    })
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const out = await res.json()
    if (!res.ok) {
      console.error('stripe error', res.status, JSON.stringify(out).slice(0, 500))
      return json({ error: res.status === 401 ? 'The Stripe key was rejected. Check STRIPE_SECRET_KEY.' : 'Stripe could not start the payment. Try again.' }, 502)
    }
    return json({ url: out.url as string, amount: balance })
  } catch (e) {
    console.error('stripe-checkout failed', e)
    return json({ error: 'Something went wrong starting the payment.' }, 500)
  }
})
