import { useDialog } from '../components/dialog'
import { useState } from 'react'
import { useStore } from '../store'
import type { AnswerType, Audit, AuditGroup, AuditQuestion } from '../types'
import { uid } from '../lib/id'

const TYPES: AnswerType[] = ['yesno', 'text', 'number', 'photo', 'signature']
const move = <T,>(arr: T[], i: number, d: number) => {
  const j = i + d
  if (j < 0 || j >= arr.length) return arr
  const next = [...arr]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

export default function Audits() {
  const { ask } = useDialog()
  const { db, upsertAudit, deleteAudit, saveAuditResult } = useStore()
  const [search, setSearch] = useState('')
  const [selId, setSelId] = useState<string | null>(db.audits[0]?.id ?? null)
  const [draft, setDraft] = useState<Audit | null>(db.audits[0] ?? null)
  const [dirty, setDirty] = useState(false)
  const [mode, setMode] = useState<'edit' | 'run'>('edit')
  const [jobId, setJobId] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')

  const select = async (a: Audit) => {
    if (dirty && !(await ask({ message: 'Discard your unsaved changes to this audit?', confirmLabel: 'Discard', danger: true }))) return
    setSelId(a.id)
    setDraft(JSON.parse(JSON.stringify(a)))
    setDirty(false)
    setAnswers({})
    setMsg('')
  }
  const change = (next: Audit) => { setDraft(next); setDirty(true) }
  const setGroup = (gid: string, fn: (g: AuditGroup) => AuditGroup) =>
    draft && change({ ...draft, groups: draft.groups.map((g) => (g.id === gid ? fn(g) : g)) })
  const setQuestion = (gid: string, qid: string, patch: Partial<AuditQuestion>) =>
    setGroup(gid, (g) => ({ ...g, questions: g.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) }))

  const newAudit = () => {
    const a: Audit = { id: uid(), folder: 'Quality Assurance', name: 'New audit', groups: [] }
    upsertAudit(a)
    setSelId(a.id)
    setDraft(a)
    setDirty(false)
  }
  const save = () => { if (draft) { upsertAudit(draft); setDirty(false) } }

  const s = search.trim().toLowerCase()
  const folders = [...new Set(db.audits.map((a) => a.folder))].sort()

  const submitRun = () => {
    if (!draft) return
    if (dirty) return setMsg('Save your changes before running the audit.')
    if (!jobId) return setMsg('Choose the job this audit is for.')
    const missing = draft.groups.flatMap((g) => g.questions.filter((q) => q.required && !answers[q.id]))
    if (missing.length) return setMsg(`${missing.length} required question(s) still need an answer.`)
    saveAuditResult({ auditId: draft.id, auditName: draft.name, jobId: Number(jobId), snapshot: JSON.parse(JSON.stringify(draft.groups)), answers })
    setAnswers({})
    setMsg('Audit result saved to the job.')
  }

  const results = db.auditResults

  return (
    <>
      <h1>Mobile Settings <span className="muted">Audits</span></h1>
      <p className="muted">Audits are pushed to the technician app. Editing an audit never changes results that were already completed.</p>

      <div className="split">
        <div className="card">
          <div className="row">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for an audit" />
            <button onClick={() => setSearch('')}>Clear</button>
          </div>
          <div className="row between"><h3>Choose an audit</h3><button onClick={newAudit}>+ Audit</button></div>
          <ul className="tree">
            {folders.map((f) => (
              <li key={f}>
                <b>📁 {f}</b>
                <ul>
                  {db.audits
                    .filter((a) => a.folder === f && (!s || a.name.toLowerCase().includes(s) || a.groups.some((g) => g.name.toLowerCase().includes(s))))
                    .map((a) => (
                      <li key={a.id}>
                        <button className={`link-btn ${a.id === selId ? 'sel' : ''}`} onClick={() => select(a)}>{a.name}</button>
                        {a.id === selId && (
                          <ul>
                            {a.groups.map((g) => (
                              <li key={g.id}>
                                {g.name}
                                <ul>{g.questions.map((q) => <li key={q.id} className="muted">{q.text}</li>)}</ul>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>

        <div>
          {!draft && <p className="muted">Select or create an audit.</p>}
          {draft && (
            <>
              <div className="subtabs">
                <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>Edit</button>
                <button className={mode === 'run' ? 'active' : ''} onClick={() => setMode('run')}>Run on a job</button>
              </div>

              {mode === 'edit' && (
                <>
                  <div className="card">
                    <div className="row wrap">
                      <label>Name <input value={draft.name} onChange={(e) => change({ ...draft, name: e.target.value })} /></label>
                      <label>Folder <input value={draft.folder} onChange={(e) => change({ ...draft, folder: e.target.value })} /></label>
                      <button className="primary" disabled={!dirty} onClick={save}>Save</button>
                      <button onClick={async () => { if (await ask({ message: 'Delete this audit? Completed results are kept.', confirmLabel: 'Delete', danger: true })) { deleteAudit(draft.id); setSelId(null); setDraft(null) } }}>Delete</button>
                    </div>
                  </div>
                  {draft.groups.map((g, gi) => (
                    <div key={g.id} className="card">
                      <div className="row between">
                        <input className="cc-name" value={g.name} onChange={(e) => setGroup(g.id, (x) => ({ ...x, name: e.target.value }))} />
                        <div className="row">
                          <label><input type="checkbox" checked={g.mandatory} onChange={(e) => setGroup(g.id, (x) => ({ ...x, mandatory: e.target.checked }))} /> Mandatory</label>
                          <button onClick={() => change({ ...draft, groups: move(draft.groups, gi, -1) })}>↑</button>
                          <button onClick={() => change({ ...draft, groups: move(draft.groups, gi, 1) })}>↓</button>
                          <button onClick={() => change({ ...draft, groups: draft.groups.filter((x) => x.id !== g.id) })}>Remove</button>
                        </div>
                      </div>
                      <textarea rows={2} placeholder="Description" value={g.description} onChange={(e) => setGroup(g.id, (x) => ({ ...x, description: e.target.value }))} />
                      {g.questions.map((q, qi) => (
                        <div key={q.id} className="row wrap qrow">
                          <input className="grow" value={q.text} onChange={(e) => setQuestion(g.id, q.id, { text: e.target.value })} />
                          <select value={q.answerType} onChange={(e) => setQuestion(g.id, q.id, { answerType: e.target.value as AnswerType })}>
                            {TYPES.map((t) => <option key={t}>{t}</option>)}
                          </select>
                          <label><input type="checkbox" checked={q.required} onChange={(e) => setQuestion(g.id, q.id, { required: e.target.checked })} /> Required</label>
                          <button onClick={() => setGroup(g.id, (x) => ({ ...x, questions: move(x.questions, qi, -1) }))}>↑</button>
                          <button onClick={() => setGroup(g.id, (x) => ({ ...x, questions: move(x.questions, qi, 1) }))}>↓</button>
                          <button onClick={() => setGroup(g.id, (x) => ({ ...x, questions: x.questions.filter((z) => z.id !== q.id) }))}>×</button>
                        </div>
                      ))}
                      <button onClick={() => setGroup(g.id, (x) => ({ ...x, questions: [...x.questions, { id: uid(), text: 'New question', answerType: 'yesno', required: false }] }))}>+ Question</button>
                    </div>
                  ))}
                  <button onClick={() => change({ ...draft, groups: [...draft.groups, { id: uid(), name: `Part ${draft.groups.length + 1}`, mandatory: false, description: '', questions: [] }] })}>+ Group</button>
                </>
              )}

              {mode === 'run' && (
                <div className="card">
                  <div className="row">
                    <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
                      <option value="">Job…</option>
                      {db.jobs.map((j) => <option key={j.id} value={j.id}>{j.id} – {j.name}</option>)}
                    </select>
                    {db.jobs.length === 0 && <span className="muted">No jobs yet.</span>}
                  </div>
                  {draft.groups.map((g) => (
                    <div key={g.id}>
                      <h3>{g.name}{g.mandatory && ' *'}</h3>
                      <p className="muted">{g.description}</p>
                      {g.questions.map((q) => (
                        <label key={q.id} className="block">{q.text}{q.required && ' *'}
                          {q.answerType === 'yesno' ? (
                            <select value={answers[q.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
                              <option value="">–</option><option>Yes</option><option>No</option><option>N/A</option>
                            </select>
                          ) : (
                            <input
                              type={q.answerType === 'number' ? 'number' : 'text'}
                              placeholder={q.answerType === 'photo' ? 'Photo file name (camera on the mobile app)' : q.answerType === 'signature' ? 'Type name as signature' : ''}
                              value={answers[q.id] ?? ''}
                              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                            />
                          )}
                        </label>
                      ))}
                    </div>
                  ))}
                  <button className="primary" onClick={submitRun}>Complete audit</button>
                </div>
              )}
              {msg && <p className={msg.includes('saved') ? '' : 'error'}>{msg}</p>}
            </>
          )}
        </div>
      </div>

      <h3>Completed audits ({results.length})</h3>
      <table>
        <thead><tr><th>Audit</th><th>Job</th><th>Completed</th><th>Answered</th></tr></thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.id}>
              <td>{r.auditName}</td><td>{r.jobId}</td><td>{new Date(r.completedAt).toLocaleString()}</td>
              <td>{Object.keys(r.answers).length} / {r.snapshot.reduce((a, g) => a + g.questions.length, 0)}</td>
            </tr>
          ))}
          {results.length === 0 && <tr><td colSpan={4} className="muted">None yet.</td></tr>}
        </tbody>
      </table>
    </>
  )
}
