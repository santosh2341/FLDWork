import type { SharedFile } from '../lib/portal'

// Files the office shared with the customer ("Customer can see" on the quote's Attachments tab),
// listed on the customer's quote link (/q/) and in their portal (/p/).
export default function SharedFiles({ files, title = 'Attachments' }: { files?: SharedFile[]; title?: string }) {
  if (!files?.length) return null
  return (
    <div className="qp-files">
      <h3>{title}</h3>
      <ul>
        {files.map((f) => (
          <li key={f.id}>
            <span className="qp-file-ic" aria-hidden="true">{ext(f.name)}</span>
            <span className="qp-file-name">{f.name}<small className="muted">{Math.max(1, Math.round(f.size / 1024))} KB</small></span>
            <a className="btn" href={f.dataUrl} download={f.name}>Download</a>
          </li>
        ))}
      </ul>
    </div>
  )
}

const ext = (name: string) => (name.includes('.') ? name.split('.').pop()!.slice(0, 4).toUpperCase() : 'FILE')
