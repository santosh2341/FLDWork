import { useState } from 'react'
import { useStore } from '../store'
import { DUE_LABEL, dueState, todayIso } from '../lib/assets'
import type { Asset } from '../types'

// Equipment at a site, with a quick "Log service" (used on My day, where technicians record what they serviced).
export default function AssetLogger({ assets, jobId, by }: { assets: Asset[]; jobId?: number; by: string }) {
  const { logAssetService } = useStore()
  const [open, setOpen] = useState('')
  const [notes, setNotes] = useState('')
  if (assets.length === 0) return null
  return (
    <div className="md-notes">
      <b>Equipment on site</b>
      {assets.map((a) => {
        const st = dueState(a)
        return (
          <div key={a.id} className="asset-row">
            <div>
              <b>{a.name}</b> <span className={`pill due-${st}`}>{DUE_LABEL[st]}</span>
              <div className="muted">{[a.make, a.model, a.serial && `S/N ${a.serial}`, a.location].filter(Boolean).join(' · ')}</div>
              <div className="muted">{a.lastServiced ? `Last serviced ${a.lastServiced}` : 'Never serviced here'}{a.nextDue ? ` · next due ${a.nextDue}` : ''}</div>
            </div>
            {open === a.id ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <textarea rows={2} placeholder="What was done / found (filters, refrigerant, faults…)" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <div className="row">
                  <button className="primary" onClick={() => { logAssetService(a.id, todayIso(), notes.trim(), by, jobId); setOpen(''); setNotes('') }}>Save service</button>
                  <button onClick={() => setOpen('')}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setOpen(a.id); setNotes('') }}>Log service</button>
            )}
          </div>
        )
      })}
    </div>
  )
}
