import { useState } from 'react'
import { useStore } from '../store'
import { polishText } from '../lib/ai'

// "Tidy with AI" for a text box: shows the rewrite for approval before anything changes.
export default function AiPolish({ text, kind, onAccept }: { text: string; kind: 'scope' | 'notes' | 'job_summary'; onAccept: (t: string) => void }) {
  const { remote, canWrite } = useStore()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  if (!remote || !canWrite) return null

  const run = async () => {
    setBusy(true); setError(''); setResult('')
    try {
      setResult(await polishText(text, kind))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="ai-polish">
      <button type="button" className="ai-btn" disabled={busy || !text.trim()} onClick={run} title={text.trim() ? '' : 'Write something first'}>
        ✨ {busy ? 'Tidying…' : 'Tidy with AI'}
      </button>
      {error && <span className="error"> {error}</span>}
      {result && (
        <div className="ai-result">
          <div className="muted">AI suggestion. Check it before using it.</div>
          <p className="doc-scope">{result}</p>
          <div className="row">
            <button type="button" className="primary" onClick={() => { onAccept(result); setResult('') }}>Use this</button>
            <button type="button" onClick={() => setResult('')}>Discard</button>
          </div>
        </div>
      )}
    </div>
  )
}
