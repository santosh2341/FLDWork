import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import Audits from './Audits'
import type { AppSettings, JobStatus } from '../types'

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'statuses', label: 'Statuses' },
  { key: 'audits', label: 'Audits' },
  { key: 'invoicing', label: 'Invoicing' },
] as const

const DEFAULT_LABELS: Record<JobStatus, string> = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  complete: 'Complete',
  invoiced: 'Invoiced',
}

export default function MobileSettings() {
  const { tab } = useParams()
  const nav = useNavigate()
  const { db, updateSettings } = useStore()
  const [draft, setDraft] = useState<AppSettings>(db.settings)
  const [saved, setSaved] = useState(true)
  const [error, setError] = useState('')
  const current = TABS.find((t) => t.key === tab)?.key ?? 'general'

  const change = (patch: Partial<AppSettings>) => {
    setDraft({ ...draft, ...patch })
    setSaved(false)
    setError('')
  }

  const save = () => {
    if (!draft.companyName.trim()) return setError('Company name cannot be empty.')
    if (!(draft.defaultTaxRate >= 0 && draft.defaultTaxRate <= 100)) return setError('Tax rate must be between 0 and 100.')
    if (!(draft.paymentTermsDays >= 0 && Number.isInteger(draft.paymentTermsDays))) return setError('Payment terms must be a whole number of days.')
    const labels = (Object.values(draft.jobStatusLabels) as string[]).map((l) => l.trim().toLowerCase())
    if (labels.some((l) => !l)) return setError('Every job status needs a name.')
    if (new Set(labels).size !== labels.length) return setError('Job status names must be different from each other.')
    updateSettings({ ...draft, companyName: draft.companyName.trim() })
    setSaved(true)
  }

  return (
    <>
      <h1>Mobile settings</h1>
      <div className="subtabs">
        {TABS.map((t) => (
          <button key={t.key} className={t.key === current ? 'active' : ''} onClick={() => nav(`/settings/${t.key}`)}>{t.label}</button>
        ))}
      </div>

      {current === 'audits' ? (
        <Audits />
      ) : (
        <>
          {current === 'general' && (
            <div className="card narrow">
              <label className="block">Company name
                <input className="wide" value={draft.companyName} onChange={(e) => change({ companyName: e.target.value })} />
              </label>
              <label className="row">
                <input type="checkbox" checked={draft.requireAuditsToComplete} onChange={(e) => change({ requireAuditsToComplete: e.target.checked })} />
                Technicians must finish a quote's required audits before a job can be marked complete
              </label>
            </div>
          )}

          {current === 'statuses' && (
            <div className="card narrow">
              <p className="muted">Rename how each job status appears. The workflow itself does not change.</p>
              {(Object.keys(DEFAULT_LABELS) as JobStatus[]).map((k) => (
                <label className="block" key={k}>{DEFAULT_LABELS[k]}
                  <input className="wide" value={draft.jobStatusLabels[k]} onChange={(e) => change({ jobStatusLabels: { ...draft.jobStatusLabels, [k]: e.target.value } })} />
                </label>
              ))}
              <button onClick={() => change({ jobStatusLabels: { ...DEFAULT_LABELS } })}>Reset to defaults</button>
            </div>
          )}

          {current === 'invoicing' && (
            <div className="card narrow">
              <label className="block">Default tax rate (%), used on new quotes
                <input type="number" min="0" max="100" step="0.5" value={draft.defaultTaxRate} onChange={(e) => change({ defaultTaxRate: Number(e.target.value) })} />
              </label>
              <label className="block">Payment terms (days from issue date), used on new invoices
                <input type="number" min="0" step="1" value={draft.paymentTermsDays} onChange={(e) => change({ paymentTermsDays: Number(e.target.value) })} />
              </label>
              <label className="block">Invoice footer note
                <textarea rows={3} value={draft.invoiceFooter} onChange={(e) => change({ invoiceFooter: e.target.value })} placeholder="Bank details, thank-you message…" />
              </label>
              <p className="muted">Existing quotes and invoices keep the values they already have.</p>
            </div>
          )}

          {error && <p className="error">{error}</p>}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" disabled={saved} onClick={save}>Save settings</button>
            <span className="muted">{saved ? 'All changes saved.' : 'Unsaved changes'}</span>
          </div>
        </>
      )}
    </>
  )
}
