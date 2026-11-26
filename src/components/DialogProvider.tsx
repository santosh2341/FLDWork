import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DialogContext } from './dialog'
import type { AskOptions, DialogApi } from './dialog'

type Open = AskOptions & { kind: 'ask' | 'tell'; resolve: (ok: boolean) => void }

// One dialog at a time, drawn in the page (no browser pop-ups). Esc or clicking outside cancels.
export default function DialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null)
  const okRef = useRef<HTMLButtonElement>(null)

  const close = useCallback((ok: boolean) => {
    setOpen((cur) => { cur?.resolve(ok); return null })
  }, [])

  const api = useMemo<DialogApi>(() => ({
    ask: (o) => new Promise<boolean>((resolve) => setOpen({ ...(typeof o === 'string' ? { message: o } : o), kind: 'ask', resolve })),
    tell: (message, title) => new Promise<void>((resolve) => setOpen({ message, title, kind: 'tell', resolve: () => resolve() })),
  }), [])

  useEffect(() => {
    if (!open) return
    okRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  return (
    <DialogContext.Provider value={api}>
      {children}
      {open && (
        <div className="modal-bg" onClick={() => close(false)}>
          <div className="modal app-dialog" role={open.kind === 'ask' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="app-dialog-msg" onClick={(e) => e.stopPropagation()}>
            {open.title && <h3>{open.title}</h3>}
            <p id="app-dialog-msg">{open.message}</p>
            <div className="row">
              <button ref={okRef} className={open.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{open.confirmLabel ?? 'OK'}</button>
              {open.kind === 'ask' && <button onClick={() => close(false)}>{open.cancelLabel ?? 'Cancel'}</button>}
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}
