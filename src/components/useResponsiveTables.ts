import { useEffect } from 'react'

// On phones, CSS turns each table row into a card. The card needs each cell's column heading, so copy it onto the cell
// (data-label). Tables that contain text fields (e.g. line-item editors) keep their table layout and scroll sideways.
export function useResponsiveTables(root: React.RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    let queued = false
    const run = () => {
      queued = false
      el.querySelectorAll('table').forEach((t) => {
        const editable = Array.from(t.querySelectorAll('tbody input:not([type=checkbox]):not([type=radio]):not([type=file]), tbody textarea')).some((f) => !f.closest('details'))
        if (editable) { t.classList.add('keep-table'); return }
        t.classList.remove('keep-table')
        const heads = Array.from(t.querySelectorAll('thead th')).map((h) => (h.textContent ?? '').trim())
        if (!heads.length) return
        t.querySelectorAll('tbody tr').forEach((tr) => {
          let i = 0
          Array.from(tr.children).forEach((td) => {
            const span = Number((td as HTMLTableCellElement).colSpan || 1)
            if (span === 1 && td.getAttribute('data-label') !== heads[i]) td.setAttribute('data-label', heads[i] ?? '')
            i += span
          })
        })
      })
    }
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(run) } }
    run()
    const mo = new MutationObserver(queue)
    mo.observe(el, { childList: true, subtree: true })
    return () => mo.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
