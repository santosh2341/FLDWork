import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { draftQuote } from '../lib/ai'
import type { QuoteDraft } from '../lib/ai'
import { money } from '../lib/costing'
import { uid } from '../lib/id'

// Paste a customer's email or a few notes; the AI proposes line items from your catalog; you review, then create the quote.
export default function AiQuoteDraft({ onClose }: { onClose: () => void }) {
  const { db, createQuote, fillQuote } = useStore()
  const nav = useNavigate()
  const [customerId, setCustomerId] = useState(db.customers[0]?.id ?? '')
  const sites = db.sites.filter((s) => s.customerId === customerId)
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '')
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<QuoteDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pickCustomer = (id: string) => { setCustomerId(id); setSiteId(db.sites.find((s) => s.customerId === id)?.id ?? '') }

  const run = async () => {
    setError(''); setDraft(null)
    if (!text.trim()) return setError('Paste the customer request or write a few notes first.')
    setBusy(true)
    try {
      setDraft(await draftQuote(text))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const setItem = (i: number, patch: Partial<QuoteDraft['items'][number]>) =>
    draft && setDraft({ ...draft, items: draft.items.map((x, k) => (k === i ? { ...x, ...patch } : x)) })

  const create = async () => {
    if (!draft) return
    if (!customerId || !siteId) return setError('Choose a customer and a site for this quote.')
    if (!draft.items.length) return setError('The draft has no items.')
    setBusy(true)
    const id = await createQuote(customerId, siteId, draft.title.trim() || 'Quote')
    if (id) {
      await fillQuote(id, { description: draft.description, items: draft.items.map(({ needsPrice: _n, ...i }) => ({ ...i, id: uid() })) })
      nav(`/quotes/${id}`)
    }
    setBusy(false)
  }

  const total = draft ? draft.items.reduce((a, i) => a + i.quantity * i.unitSell, 0) : 0
  const unpriced = draft?.items.filter((i) => i.needsPrice).length ?? 0

  return (
    <div className="card ai-card">
      <div className="row between"><h3>✨ Draft a quote with AI</h3><button type="button" onClick={onClose}>Close</button></div>
      <p className="muted">Paste a customer email or write a few notes. The AI picks parts from your catalog and estimates labour. Prices come from your catalog, never from the AI. You review everything before the quote is created.</p>
      <div className="row wrap">
        <label>Customer<br />
          <select value={customerId} onChange={(e) => pickCustomer(e.target.value)}>{db.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label>Site<br />
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.length === 0 && <option value="">No sites</option>}
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <textarea rows={6} maxLength={8000} value={text} onChange={(e) => setText(e.target.value)} placeholder={'e.g. "Hi, we need 4 cameras and a recorder installed at the clinic, plus new LED downlights in reception. Can you quote?"'} />
      <div className="row"><button className="primary" disabled={busy} onClick={run}>{busy && !draft ? 'Drafting…' : draft ? 'Draft again' : 'Draft quote'}</button></div>
      {error && <p className="error">{error}</p>}

      {draft && (
        <div className="ai-result">
          <label className="block">Quote name<br /><input className="wide" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
          <p className="doc-scope">{draft.description}</p>
          <table>
            <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th><th /></tr></thead>
            <tbody>
              {draft.items.map((i, k) => (
                <tr key={k}>
                  <td>{i.description}{i.needsPrice && <span className="pill warn" title="Not in your catalog. Price it on the quote."> needs price</span>}</td>
                  <td className="num"><input type="number" min="0" step="0.5" value={i.quantity} onChange={(e) => setItem(k, { quantity: Number(e.target.value) })} /></td>
                  <td className="num">{i.needsPrice ? '–' : money(i.unitSell)}</td>
                  <td className="num">{i.needsPrice ? '–' : money(i.quantity * i.unitSell)}</td>
                  <td><button type="button" className="link-btn" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== k) })}>remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p><b>Estimated total (ex GST): {money(total)}</b>{unpriced > 0 && <span className="muted"> + {unpriced} item{unpriced > 1 ? 's' : ''} to price</span>}</p>
          {draft.assumptions.length > 0 && <><h4>Assumptions</h4><ul>{draft.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></>}
          {draft.questions.length > 0 && <><h4>Confirm with the customer</h4><ul>{draft.questions.map((a) => <li key={a}>{a}</li>)}</ul></>}
          <div className="row"><button className="primary" disabled={busy} onClick={create}>Create quote from this draft</button><button onClick={() => setDraft(null)}>Discard</button></div>
        </div>
      )}
    </div>
  )
}
