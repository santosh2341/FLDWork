import { useState } from 'react'

// Long lists show 40 rows at a time. Hundreds of rows at once is slow on a phone (and can make the browser give up).
const STEP = 40
export function usePaged<T>(rows: T[]) {
  const [n, setN] = useState(STEP)
  const shown = rows.slice(0, n)
  const more = rows.length > n ? (
    <div className="more-rows">
      <button onClick={() => setN(n + STEP)}>Show {Math.min(STEP, rows.length - n)} more</button>
      <button className="link-btn" onClick={() => setN(rows.length)}>Show all {rows.length}</button>
    </div>
  ) : null
  return { shown, more }
}
