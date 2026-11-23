import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

// Photos on a job: take or choose pictures (phone camera opens directly), view them, and remove them (office roles).
export default function JobPhotos({ jobId, author, canAdd = true }: { jobId: number; author: string; canAdd?: boolean }) {
  const { db, addJobPhoto, deleteJobPhoto, photoUrls, canWrite } = useStore()
  const photos = db.jobPhotos.filter((p) => p.jobId === jobId)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [big, setBig] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const key = photos.map((p) => p.id).join(',')

  useEffect(() => {
    let live = true
    if (photos.length) void photoUrls(photos).then((u) => live && setUrls(u))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setErr('')
    for (const f of Array.from(files)) {
      const e = await addJobPhoto(jobId, f, author)
      if (e) { setErr(e); break }
    }
    setBusy(false)
    if (input.current) input.current.value = ''
  }

  return (
    <div className="job-photos">
      <b>Photos ({photos.length})</b>
      <div className="jp-grid">
        {photos.map((p) => (
          <figure key={p.id}>
            {urls[p.id] ? <img src={urls[p.id]} alt={p.name || 'Job photo'} loading="lazy" onClick={() => setBig(urls[p.id])} /> : <div className="jp-ph" />}
            {canWrite && <button className="link-btn" onClick={() => confirm('Remove this photo?') && deleteJobPhoto(p.id)}>Remove</button>}
          </figure>
        ))}
      </div>
      {canAdd && (
        <>
          <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void pick(e.target.files)} />
          <button disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : '📷 Add photo'}</button>
        </>
      )}
      {err && <p className="error">{err}</p>}
      {big && <div className="jp-lightbox" onClick={() => setBig('')}><img src={big} alt="Job photo large" /></div>}
    </div>
  )
}
