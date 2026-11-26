// Fieldwork: emails a quote or invoice to the customer on record, as a clean HTML email, via Resend.
// Optional: the PDF made in the app (attached, max ~4 MB) and, for quotes, a button to the customer's
// "accept online" page (/q/<token>; the token must belong to this quote and still be active).
// Runs as the signed-in user (reads under their permissions). The recipient is ALWAYS the customer's email on file,
// so this cannot be used to send mail to arbitrary addresses. Limit: 50 emails per company per day.
// Secrets: RESEND_API_KEY, EMAIL_FROM (an address on a domain verified in Resend, e.g. quotes@yourcompany.com.au;
// optional while testing: defaults to onboarding@resend.dev, which only delivers to the Resend account owner).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const DAILY_LIMIT = 50

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const money = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
const auDate = (iso?: string) => (iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const addrLines = (a?: string) => {
  const m = /(?:Street|Postal):\s*(.*?)\s*•\s*City\/Suburb:\s*(.*?)\s*•\s*State:\s*.*?\((\w+)\)\s*•\s*Postcode:\s*(\d+)/.exec(a ?? '')
  return m ? [m[1], `${m[2]} ${m[3]} ${m[4]}`] : a ? [a] : []
}

interface Item { description: string; quantity: number; unit_sell: number; kind: string }
const rowsHtml = (groups: { name: string; items: Item[] }[]) =>
  groups.map((g) =>
    (groups.length > 1 ? `<tr><td colspan="4" style="padding:8px 0 4px;font-weight:600;color:#475569">${esc(g.name)}</td></tr>` : '') +
    g.items.map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e5e7eb">${esc(i.description)}</td><td style="padding:6px 0;border-bottom:1px solid #e5e7eb;text-align:right">${i.quantity}${i.kind === 'labour' ? ' h' : ''}</td><td style="padding:6px 0;border-bottom:1px solid #e5e7eb;text-align:right">${money(i.unit_sell)}</td><td style="padding:6px 0;border-bottom:1px solid #e5e7eb;text-align:right">${money(i.quantity * i.unit_sell)}</td></tr>`).join('')).join('')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    // Without EMAIL_FROM, fall back to Resend's shared test sender (it only delivers to the Resend account's own address)
    // (a bare address: the company name is added below as the display name)
    const from = Deno.env.get('EMAIL_FROM')?.trim() || 'onboarding@resend.dev'
    if (!apiKey) return json({ error: 'Email sending is not set up yet. An admin needs to add the RESEND_API_KEY secret in Supabase.', code: 'not_configured' }, 503)

    const auth = req.headers.get('Authorization') ?? ''
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) return json({ error: 'Please sign in again.', code: 'auth' }, 401)
    const { data: canWrite } = await sb.rpc('can_write')
    if (!canWrite) return json({ error: 'Your role cannot send emails.' }, 403)

    const body = await req.json()
    const kind = body.kind as 'quote' | 'invoice'
    const id = Number(body.id)
    if (!['quote', 'invoice'].includes(kind) || !Number.isFinite(id)) return json({ error: 'Unknown document.' }, 400)
    const pdf = typeof body.pdf === 'string' ? body.pdf : ''
    if (pdf && (pdf.length > 5_600_000 || !pdf.startsWith('JVBER'))) return json({ error: 'The PDF is too large or not a PDF.' }, 400)
    const linkToken = typeof body.linkToken === 'string' && /^[0-9a-f]{64}$/.test(body.linkToken) ? body.linkToken : ''
    const message = String(body.message ?? '').slice(0, 4000)
    const subject = String(body.subject ?? '').trim().slice(0, 200)
    if (!subject) return json({ error: 'Add a subject.' }, 400)

    const { data: co } = await sb.from('companies').select('id, name, profile').limit(1).single()
    const p = (co?.profile ?? {}) as Record<string, string>
    const company = p.tradingName || co?.name || 'Our company'

    const today = new Date().toISOString().slice(0, 10)
    const { count } = await sb.from('email_log').select('id', { count: 'exact', head: true }).gte('created_at', today)
    if ((count ?? 0) >= DAILY_LIMIT) return json({ error: `Daily email limit reached (${DAILY_LIMIT}). It resets tomorrow.` }, 429)

    let customerId: string, siteId: string | null, title: string, number: number, meta: [string, string][], groups: { name: string; items: Item[] }[]
    let subtotal = 0, discount = 0, taxRate = 0, scope = '', after = '', balance: number | null = null
    if (kind === 'quote') {
      const { data: q, error } = await sb.from('quotes').select('*, cost_centers(name, sort, line_items(description, quantity, unit_sell, kind, sort))').eq('id', id).single()
      if (error || !q) return json({ error: 'Quote not found.' }, 404)
      customerId = q.customer_id; siteId = q.site_id; title = 'Quote'; number = q.id
      const valid = new Date(q.created_at ?? q.updated_at); valid.setDate(valid.getDate() + 30)
      meta = [['Date', auDate(q.created_at ?? q.updated_at)], ['Valid until', auDate(valid.toISOString())]]
      groups = (q.cost_centers ?? []).sort((a: { sort: number }, b: { sort: number }) => a.sort - b.sort).map((c: { name: string; line_items: Item[] }) => ({ name: c.name, items: c.line_items ?? [] }))
      discount = Number(q.discount ?? 0); taxRate = Number(q.tax_rate ?? 0)
      if (q.description) scope = `<p style="white-space:pre-wrap">${esc(q.description)}</p>`
      subtotal = groups.reduce((a, g) => a + g.items.reduce((b, i) => b + i.quantity * i.unit_sell, 0), 0)
    } else {
      const { data: inv, error } = await sb.from('invoices').select('*, invoice_sections(name, sort, invoice_items(description, quantity, unit_sell, kind, sort)), payments(amount), credits(amount)').eq('id', id).single()
      if (error || !inv) return json({ error: 'Invoice not found.' }, 404)
      if (inv.stage === 'draft' || inv.voided) return json({ error: inv.voided ? 'This invoice is voided.' : 'Approve the invoice before sending it.' }, 400)
      customerId = inv.customer_id; siteId = inv.site_id; number = inv.id
      title = Number(inv.tax_rate) > 0 && p.abn ? 'Tax Invoice' : 'Invoice'
      meta = [['Issued', auDate(inv.issued_at)], ['Payment due', auDate(inv.due_at)]]
      groups = (inv.invoice_sections ?? []).sort((a: { sort: number }, b: { sort: number }) => a.sort - b.sort).map((c: { name: string; invoice_items: Item[] }) => ({ name: c.name, items: c.invoice_items ?? [] }))
      discount = Number(inv.discount ?? 0); taxRate = Number(inv.tax_rate ?? 0)
      subtotal = groups.reduce((a, g) => a + g.items.reduce((b, i) => b + i.quantity * i.unit_sell, 0), 0)
      const total = (subtotal - discount) * (1 + taxRate / 100)
      const paid = (inv.payments ?? []).reduce((a: number, x: { amount: number }) => a + Number(x.amount), 0) + (inv.credits ?? []).reduce((a: number, x: { amount: number }) => a + Number(x.amount), 0)
      balance = total - paid
      if (inv.notes) after += `<p style="white-space:pre-wrap">${esc(inv.notes)}</p>`
      if (p.bsb || p.accountNumber) after += `<p style="background:#f1f5f9;padding:10px;border-radius:6px"><b>Pay by bank transfer</b><br>${esc(p.accountName || company)}<br>BSB ${esc(p.bsb)} · Account ${esc(p.accountNumber)}${p.bankName ? ' (' + esc(p.bankName) + ')' : ''}<br>Reference: Invoice ${number}</p>`
    }

    const { data: cust } = await sb.from('customers').select('name, contact_name, email, address').eq('id', customerId).single()
    if (!cust?.email || !/^\S+@\S+\.\S+$/.test(cust.email)) return json({ error: 'This customer has no valid email address on file. Add one on the customer page first.' }, 400)
    const { data: site } = siteId ? await sb.from('sites').select('name, address').eq('id', siteId).single() : { data: null }

    // Quote: a button to accept online, using a link that belongs to this quote and is still usable
    let acceptUrl = ''
    if (kind === 'quote' && linkToken) {
      const { data: link } = await sb.from('quote_links').select('token, expires_at').eq('token', linkToken).eq('quote_id', id).is('revoked_at', null).is('decision', null).maybeSingle()
      const origin = (req.headers.get('origin') ?? Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
      if (link && new Date(link.expires_at as string) > new Date() && /^https?:\/\/[\w.-]+(:\d+)?$/.test(origin)) acceptUrl = `${origin}/q/${linkToken}`
    }
    if (acceptUrl) after = `<p style="margin:22px 0"><a href="${esc(acceptUrl)}" style="background:#0f766e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;display:inline-block">View and accept this quote online</a></p>` + after

    const net = subtotal - discount
    const tax = net * (taxRate / 100)
    const total = net + tax
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:640px;margin:0 auto;font-size:14px;line-height:1.45">
      <p style="white-space:pre-wrap">${esc(message)}</p>
      <hr style="border:0;border-top:1px solid #e5e7eb;margin:20px 0">
      <table style="width:100%"><tr><td style="vertical-align:top"><b style="font-size:16px">${esc(company)}</b><br>${p.abn ? 'ABN ' + esc(p.abn) + '<br>' : ''}${p.licence ? 'Licence ' + esc(p.licence) + '<br>' : ''}${addrLines(p.address).map(esc).join('<br>')}${p.phone ? '<br>' + esc(p.phone) : ''}</td>
      <td style="vertical-align:top;text-align:right"><b style="font-size:20px">${esc(title.toUpperCase())} #${number}</b><br>${meta.map(([k, v]) => `${k}: ${esc(v)}`).join('<br>')}</td></tr></table>
      <p><b>${esc(cust.name)}</b>${site ? `<br>Site: ${esc(site.name)}${addrLines(site.address).length ? ', ' + addrLines(site.address).map(esc).join(', ') : ''}` : ''}</p>
      ${scope}
      <table style="width:100%;border-collapse:collapse"><tr style="text-align:left;color:#475569"><th style="padding:6px 0;border-bottom:2px solid #cbd5e1">Description</th><th style="text-align:right;border-bottom:2px solid #cbd5e1">Qty</th><th style="text-align:right;border-bottom:2px solid #cbd5e1">Unit price</th><th style="text-align:right;border-bottom:2px solid #cbd5e1">Amount</th></tr>${rowsHtml(groups)}</table>
      <table style="margin-left:auto;margin-top:10px"><tr><td style="padding:2px 12px">Subtotal (ex GST)</td><td style="text-align:right">${money(subtotal)}</td></tr>
      ${discount > 0 ? `<tr><td style="padding:2px 12px">Discount</td><td style="text-align:right">-${money(discount)}</td></tr>` : ''}
      <tr><td style="padding:2px 12px">GST (${taxRate}%)</td><td style="text-align:right">${money(tax)}</td></tr>
      <tr><td style="padding:4px 12px;font-weight:700;font-size:15px">Total (inc GST)</td><td style="text-align:right;font-weight:700;font-size:15px">${money(total)}</td></tr>
      ${balance !== null ? `<tr><td style="padding:2px 12px">Balance due</td><td style="text-align:right"><b>${money(balance)}</b></td></tr>` : ''}</table>
      ${after}
      <p style="color:#64748b;font-size:12px;margin-top:20px">All amounts are in Australian dollars.</p></div>`

    const toName = cust.contact_name || cust.name
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${company.replace(/[<>"]/g, '')} <${from}>`,
        to: [cust.email],
        ...(body.copyMe && u.user.email ? { cc: [u.user.email] } : {}),
        ...(p.email ? { reply_to: p.email } : {}),
        subject,
        html,
        ...(pdf ? { attachments: [{ filename: `${title.replace(/\s+/g, '-')}-${number}.pdf`, content: pdf }] } : {}),
        text: `${message}\n\n${title} #${number} – total ${money(total)}${balance !== null ? `, balance due ${money(balance)}` : ''}${acceptUrl ? `\n\nView and accept online: ${acceptUrl}` : ''}`,
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.error('resend error', res.status, detail.slice(0, 500))
      return json({ error: res.status === 403 || res.status === 422 ? 'The email service refused this message. Check that EMAIL_FROM uses a domain verified in Resend.' : 'The email service returned an error. Try again.', code: 'upstream' }, 502)
    }
    await sb.from('email_log').insert({ kind, doc_id: id, to_email: cust.email, subject })
    return json({ ok: true, to: cust.email, toName })
  } catch (e) {
    console.error('send-document failed', e)
    return json({ error: 'Something went wrong sending that email.' }, 500)
  }
})
