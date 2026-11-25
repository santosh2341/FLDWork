import { useEffect, useState } from 'react'
import PreSendCheck from '../components/PreSendCheck'
import { quoteIssues } from '../lib/checks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AiPolish from '../components/AiPolish'
import { useStore } from '../store'
import { computeCosting, money, sellFromCost, STATUS_COLOR, STATUS_LABEL } from '../lib/costing'
import { today } from '../lib/dates'
import type { CostCenter, LineItem, Quote, QuoteAttachment, QuoteStatus } from '../types'
import { uid } from '../lib/id'

const SUBTABS = ['Summary', 'Parts & Labor', 'Costing', 'Tasks', 'Forms', 'Attachments'] as const
const MAX_FILE = 400 * 1024 // browser storage is small; larger files wait for Supabase Storage

export default function QuoteDetail() {
  const { id } = useParams()
  const { db, saveQuote, openTab, createJobFromQuote, deleteQuote, canWrite } = useStore()
  const nav = useNavigate()
  const stored = db.quotes.find((q) => q.id === Number(id))
  const [draft, setDraft] = useState<Quote | null>(stored ?? null)
  const [tab, setTab] = useState<(typeof SUBTABS)[number]>('Summary')
  const [dirty, setDirty] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [attachErr, setAttachErr] = useState('')

  useEffect(() => {
    setDraft(stored ?? null)
    setDirty(false)
    // reset only when navigating between quotes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (draft) openTab({ path: `/quotes/${draft.id}`, title: `Quote #${draft.id}` })
  }, [draft?.id, openTab]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!draft) return <p>Quote not found.</p>

  const customer = db.customers.find((c) => c.id === draft.customerId)
  const site = db.sites.find((s) => s.id === draft.siteId)
  const costing = computeCosting(draft)
  const change = (patch: Partial<Quote>) => { setDraft({ ...draft, ...patch }); setDirty(true) }
  const setCC = (ccId: string, fn: (cc: CostCenter) => CostCenter) =>
    change({ costCenters: draft.costCenters.map((c) => (c.id === ccId ? fn(c) : c)) })
  const editItem = (ccId: string, itemId: string, patch: Partial<LineItem>) =>
    setCC(ccId, (cc) => ({ ...cc, items: cc.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }))

  const addPart = (ccId: string, partId: string) => {
    const p = db.catalog.find((x) => x.id === partId)
    if (!p) return
    setCC(ccId, (cc) => ({
      ...cc,
      items: [...cc.items, { id: uid(), kind: 'part', partId: p.id, description: p.description, quantity: 1, unitCost: p.cost, unitSell: sellFromCost(p.cost, p.markupPct) }],
    }))
  }
  const addPreBuild = (ccId: string, pbId: string) => {
    const pb = db.preBuilds.find((x) => x.id === pbId)
    if (!pb) return
    setCC(ccId, (cc) => ({ ...cc, items: [...cc.items, ...pb.items.map((i) => ({ ...i, id: uid() }))] }))
  }
  const addLabour = (ccId: string) =>
    setCC(ccId, (cc) => ({ ...cc, items: [...cc.items, { id: uid(), kind: 'labour', description: 'Electrical', quantity: 1, unitCost: 55, unitSell: 90 }] }))

  const save = () => {
    const withLog: Quote = { ...draft, timeline: [{ id: uid(), type: 'System', message: 'Quote saved', at: new Date().toISOString() }, ...draft.timeline] }
    const saved = { ...withLog, updatedAt: new Date().toISOString() }
    saveQuote(saved)
    setDraft(saved)
    setDirty(false)
  }

  const tasks = draft.tasks ?? []
  const openTasks = tasks.filter((t) => !t.done).length
  const log = (message: string) => ({ id: uid(), type: 'Task' as const, message, at: new Date().toISOString() })

  const addTask = () => {
    if (!taskTitle.trim()) return
    change({
      tasks: [...tasks, { id: uid(), title: taskTitle.trim(), due: taskDue, done: false }],
      timeline: [log(`Added task: ${taskTitle.trim()}`), ...draft.timeline],
    })
    setTaskTitle('')
    setTaskDue('')
  }
  const toggleTask = (id: string) => {
    const t = tasks.find((x) => x.id === id)
    if (!t) return
    change({
      tasks: tasks.map((x) => (x.id === id ? { ...x, done: !x.done } : x)),
      timeline: [log(`${t.done ? 'Reopened' : 'Completed'} task: ${t.title}`), ...draft.timeline],
    })
  }

  const onFiles = (files: FileList | null) => {
    setAttachErr('')
    for (const f of Array.from(files ?? [])) {
      if (f.size > MAX_FILE) {
        setAttachErr(`${f.name} is over ${MAX_FILE / 1024} KB and was skipped.`)
        continue
      }
      const reader = new FileReader()
      reader.onload = () => {
        const att: QuoteAttachment = { id: uid(), name: f.name, size: f.size, type: f.type, dataUrl: String(reader.result), addedAt: new Date().toISOString() }
        setDraft((d) => (d ? { ...d, attachments: [...(d.attachments ?? []), att] } : d))
        setDirty(true)
      }
      reader.readAsDataURL(f)
    }
  }

  const forms = draft.forms ?? []
  const jobIds = db.jobs.filter((j) => j.quoteId === draft.id).map((j) => j.id)
  const results = db.auditResults.filter((r) => jobIds.includes(r.jobId))

  const row = (label: string, v: string, cls = '') => (
    <tr className={cls}><td>{label}</td><td className="num">{v}</td></tr>
  )

  return (
    <>
      <div className="row between">
        <h1>Quote #{draft.id} <span className="muted">{draft.name}</span></h1>
        <div className="row">
          <span className="muted">{dirty ? 'Unsaved changes' : `Last saved ${new Date(draft.updatedAt).toLocaleString()}`}</span>
          {draft.status === 'approved' && !dirty && (
            <button onClick={async () => { const job = await createJobFromQuote(draft.id); if (job) nav('/jobs', { state: { job } }) }}>
              {db.jobs.some((j) => j.quoteId === draft.id) ? 'View job' : 'Create job'}
            </button>
          )}
          <Link className="btn" to={`/quotes/${draft.id}/print`}>Print / PDF</Link>
          {canWrite && (
            <button
              disabled={db.jobs.some((j) => j.quoteId === draft.id)}
              title={db.jobs.some((j) => j.quoteId === draft.id) ? 'This quote has a job, so it cannot be deleted' : ''}
              onClick={() => { if (confirm(`Delete quote #${draft.id}? This cannot be undone.`)) { deleteQuote(draft.id); nav('/quotes') } }}
            >Delete</button>
          )}
          <button className="primary" disabled={!dirty} onClick={save}>Save</button>
        </div>
      </div>

      <PreSendCheck issues={quoteIssues(db, draft)} />

      <div className="strip">
        <div><small>Customer</small><br />{customer?.name}</div>
        <div><small>Site</small><br />{site?.name}</div>
        <div><small>Quote total</small><br />{money(costing.total)}</div>
        <div><small>Status</small><br />
          <i className="dot" style={{ background: STATUS_COLOR[draft.status] }} />
          <select value={draft.status} onChange={(e) => {
            // a status change saves straight away, so "Approved" can't be left unsaved (jobs need an approved, saved quote)
            const status = e.target.value as QuoteStatus
            const withLog: Quote = { ...draft, status, timeline: [{ id: uid(), type: 'System', message: `Status changed to ${STATUS_LABEL[status]}`, at: new Date().toISOString() }, ...draft.timeline] }
            saveQuote(withLog)
            setDraft(withLog)
            setDirty(false)
          }}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="subtabs">
        {SUBTABS.map((t) => <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t === 'Tasks' && openTasks > 0 ? `Tasks (${openTasks})` : t}</button>)}
      </div>

      {tab === 'Summary' && (
        <div className="grid2">
          <div>
            <label className="block">Description (scope of work)
              <textarea rows={6} value={draft.description} onChange={(e) => change({ description: e.target.value })} />
              <AiPolish kind="scope" text={draft.description} onAccept={(t) => change({ description: t })} />
            </label>
            <label className="block">Notes (private, not shown to the customer)
              <textarea rows={4} value={draft.notes} onChange={(e) => change({ notes: e.target.value })} />
              <AiPolish kind="notes" text={draft.notes} onAccept={(t) => change({ notes: t })} />
            </label>
          </div>
          <div className="card">
            <h3>Timeline</h3>
            <ul className="timeline">
              {draft.timeline.map((t) => (
                <li key={t.id}><b>{t.type}</b> {t.message}<br /><small className="muted">{new Date(t.at).toLocaleString()}</small></li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'Parts & Labor' && (
        <>
          <div className="row">
            <label><input type="checkbox" checked={draft.pricesLocked} onChange={(e) => change({ pricesLocked: e.target.checked })} /> Lock items &amp; price (catalog changes won't alter this quote)</label>
          </div>
          {draft.costCenters.map((cc) => (
            <div key={cc.id} className="card">
              <div className="row between">
                <input className="cc-name" value={cc.name} onChange={(e) => setCC(cc.id, (c) => ({ ...c, name: e.target.value }))} />
                <div className="row">
                  <select value="" onChange={(e) => e.target.value && addPart(cc.id, e.target.value)}>
                    <option value="">+ Add part from catalog…</option>
                    {db.catalog.map((p) => <option key={p.id} value={p.id}>{p.partNo} – {p.description}</option>)}
                  </select>
                  <select value="" onChange={(e) => e.target.value && addPreBuild(cc.id, e.target.value)}>
                    <option value="">+ Add pre-build…</option>
                    {db.preBuilds.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button onClick={() => addLabour(cc.id)}>+ Labour</button>
                </div>
              </div>
              <table>
                <thead><tr><th>Description</th><th>Qty / hrs</th><th>Item sell</th><th>Total</th><th /></tr></thead>
                <tbody>
                  {cc.items.map((li) => (
                    <tr key={li.id}>
                      <td>{li.kind === 'labour' ? <input value={li.description} onChange={(e) => editItem(cc.id, li.id, { description: e.target.value })} /> : li.description}</td>
                      <td><input type="number" min="0" step="0.25" value={li.quantity} onChange={(e) => editItem(cc.id, li.id, { quantity: Number(e.target.value) })} /></td>
                      <td><input type="number" min="0" step="0.01" value={li.unitSell} disabled={draft.pricesLocked} onChange={(e) => editItem(cc.id, li.id, { unitSell: Number(e.target.value) })} /></td>
                      <td className="num">{money(li.quantity * li.unitSell)}</td>
                      <td><button onClick={() => setCC(cc.id, (c) => ({ ...c, items: c.items.filter((i) => i.id !== li.id) }))}>×</button></td>
                    </tr>
                  ))}
                  {cc.items.length === 0 && <tr><td colSpan={5} className="muted">No items yet.</td></tr>}
                </tbody>
              </table>
            </div>
          ))}
          <button onClick={() => change({ costCenters: [...draft.costCenters, { id: uid(), name: 'New cost center', items: [] }] })}>+ Cost center</button>
        </>
      )}

      {tab === 'Costing' && (
        <div className="card narrow">
          <table>
            <thead><tr><th>Item</th><th className="num">Estimate</th></tr></thead>
            <tbody>
              {row('Materials cost', money(costing.materialsCost))}
              {row('Resources cost', money(costing.resourcesCost))}
              {row('Materials markup', money(costing.materialsMarkup))}
              {row('Resources markup', money(costing.resourcesMarkup))}
              <tr><td>Discount / fee</td><td className="num"><input type="number" min="0" value={draft.discount} onChange={(e) => change({ discount: Number(e.target.value) })} /></td></tr>
              {row('Sub total', money(costing.subTotal), 'hl')}
              <tr className="hl"><td>Tax (%)</td><td className="num"><input type="number" min="0" value={draft.taxRate} onChange={(e) => change({ taxRate: Number(e.target.value) })} /> {money(costing.tax)}</td></tr>
              {row('Total', money(costing.total), 'hl')}
              {row('Gross P/L', money(costing.grossPL))}
              {row('Gross margin', costing.grossMargin.toFixed(1) + '%')}
              <tr><td>Overheads</td><td className="num"><input type="number" min="0" value={draft.overheads} onChange={(e) => change({ overheads: Number(e.target.value) })} /></td></tr>
              {row('Net P/L', money(costing.netPL))}
              {row('Net margin', costing.netMargin.toFixed(1) + '%')}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Tasks' && (
        <>
          <div className="card row wrap">
            <input className="grow" placeholder="New task (e.g. Book site inspection)" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
            <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
            <button className="primary" onClick={addTask}>Add task</button>
          </div>
          <table>
            <thead><tr><th>Done</th><th>Task</th><th>Due</th><th /></tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td><input type="checkbox" checked={t.done} aria-label={`Complete ${t.title}`} onChange={() => toggleTask(t.id)} /></td>
                  <td style={t.done ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>{t.title}</td>
                  <td className={!t.done && t.due && t.due < today() ? 'low' : ''}>{t.due || '–'}</td>
                  <td><button onClick={() => change({ tasks: tasks.filter((x) => x.id !== t.id) })}>×</button></td>
                </tr>
              ))}
              {tasks.length === 0 && <tr><td colSpan={4} className="muted">No tasks yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {tab === 'Forms' && (
        <>
          <p className="muted">Pick the audits technicians must complete on jobs from this quote. Completed results appear below once a job exists.</p>
          <div className="card row">
            <select value="" onChange={(e) => e.target.value && change({ forms: [...forms, e.target.value] })}>
              <option value="">+ Require an audit…</option>
              {db.audits.filter((a) => !forms.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{a.folder} / {a.name}</option>)}
            </select>
          </div>
          <table>
            <thead><tr><th>Required audit</th><th /></tr></thead>
            <tbody>
              {forms.map((fid) => (
                <tr key={fid}>
                  <td>{db.audits.find((a) => a.id === fid)?.name ?? 'Deleted audit'}</td>
                  <td><button onClick={() => change({ forms: forms.filter((x) => x !== fid) })}>Remove</button></td>
                </tr>
              ))}
              {forms.length === 0 && <tr><td colSpan={2} className="muted">No audits required.</td></tr>}
            </tbody>
          </table>
          <h3 style={{ marginTop: 16 }}>Completed</h3>
          <table>
            <thead><tr><th>Audit</th><th>Job</th><th>Completed</th></tr></thead>
            <tbody>
              {results.map((r) => <tr key={r.id}><td>{r.auditName}</td><td>{r.jobId}</td><td>{new Date(r.completedAt).toLocaleString()}</td></tr>)}
              {results.length === 0 && <tr><td colSpan={3} className="muted">No completed audits for this quote.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {tab === 'Attachments' && (
        <>
          <div className="card row wrap">
            <input type="file" multiple onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
            <span className="muted">Up to {MAX_FILE / 1024} KB per file while data is stored in the browser.</span>
          </div>
          {attachErr && <p className="error">{attachErr}</p>}
          <table>
            <thead><tr><th>File</th><th>Size</th><th>Added</th><th /></tr></thead>
            <tbody>
              {(draft.attachments ?? []).map((a) => (
                <tr key={a.id}>
                  <td><a href={a.dataUrl} download={a.name}>{a.name}</a></td>
                  <td>{Math.max(1, Math.round(a.size / 1024))} KB</td>
                  <td>{new Date(a.addedAt).toLocaleDateString()}</td>
                  <td><button onClick={() => change({ attachments: (draft.attachments ?? []).filter((x) => x.id !== a.id) })}>×</button></td>
                </tr>
              ))}
              {(draft.attachments ?? []).length === 0 && <tr><td colSpan={4} className="muted">No attachments.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
