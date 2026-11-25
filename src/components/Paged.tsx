import { useState } from 'react'

// Long lists show 40 rows at a time. Hundreds of rows at once is slow on a phone (and can make the browser give up).
// `resetKey` (for example the active tab, filter, search text or sort) puts the list back to the first 40 rows when it changes.
const STEP = 40
export function usePaged<T>(rows: T[], resetKey: unknown = '') {
  const [state, setState] = useState({ key: resetKey, n: STEP })
  const stale = !Object.is(state.key, resetKey)
  if (stale) setState({ key: resetKey, n: STEP }) // adjusting state during render is React's recommended alternative to an effect
  const n = stale ? STEP : state.n
  const show = (next: number) => setState({ key: resetKey, n: next })
  const shown = rows.slice(0, n)
  const more = rows.length > n ? (
    <div className="more-rows">
      <span className="muted">Showing {n} of {rows.length}</span>
      <button onClick={() => show(n + STEP)}>Show {Math.min(STEP, rows.length - n)} more</button>
      <button className="link-btn" onClick={() => show(rows.length)}>Show all {rows.length}</button>
    </div>
  ) : null
  return { shown, more }
}
