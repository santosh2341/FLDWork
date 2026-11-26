import { useId, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
type PickerCustomer = { id: string; name: string; contactName?: string; email?: string; phone?: string; address?: string }

// A customer box you can type into: shows matching customers as you type (name, contact, email, suburb),
// arrow keys and Enter to choose, Escape to close. Replaces long <select> lists of every customer.
// allLabel: when set, an empty value means "all customers" (used by filters) and a clear button appears.
const MAX = 50

export default function CustomerPicker({ value, onChange, allLabel, placeholder = 'Type a customer name…', customers, className = '', autoFocus }: {
  value: string
  onChange: (id: string) => void
  allLabel?: string
  placeholder?: string
  customers?: PickerCustomer[]
  className?: string
  autoFocus?: boolean
}) {
  const { db } = useStore()
  const list = useMemo((): PickerCustomer[] => [...(customers ?? db.customers)].sort((a, b) => a.name.localeCompare(b.name)), [customers, db.customers])
  const selected = list.find((c) => c.id === value)
  const [text, setText] = useState<string | null>(null) // null = not typing, show the selected name
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const q = (text ?? '').trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return list
    return list.filter((c) => [c.name, c.contactName, c.email, c.phone, c.address].join(' ').toLowerCase().includes(q))
  }, [list, q])
  const options: { id: string; label: string; sub?: string }[] = [
    ...(allLabel && !q ? [{ id: '', label: allLabel }] : []),
    ...matches.slice(0, MAX).map((c) => ({ id: c.id, label: c.name, sub: c.contactName || undefined })),
  ]

  const choose = (id: string) => {
    onChange(id)
    setText(null)
    setOpen(false)
    inputRef.current?.blur()
  }
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { if (open && options[hi]) { e.preventDefault(); choose(options[hi].id) } }
    else if (e.key === 'Escape') { setText(null); setOpen(false) }
  }

  const shown = text ?? (selected ? selected.name : allLabel && !value ? '' : '')
  return (
    <div className={`picker ${className}`}>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[hi] ? `${listId}-${hi}` : undefined}
        className="wide"
        value={shown}
        placeholder={allLabel && !value ? allLabel : placeholder}
        autoFocus={autoFocus}
        onFocus={(e) => { setOpen(true); setHi(0); e.target.select() }}
        onChange={(e) => { setText(e.target.value); setOpen(true); setHi(0) }}
        onBlur={() => { setOpen(false); setText(null) }}
        onKeyDown={onKey}
      />
      {allLabel && value && (
        <button type="button" className="picker-clear" aria-label={`Show ${allLabel.toLowerCase()}`} onMouseDown={(e) => e.preventDefault()} onClick={() => choose('')}>×</button>
      )}
      {open && (
        <ul className="picker-list" id={listId} role="listbox">
          {options.map((o, i) => (
            <li
              key={o.id || 'all'}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.id === value}
              className={i === hi ? 'hi' : undefined}
              onMouseDown={(e) => e.preventDefault()} // keep focus so the click lands before blur closes the list
              onMouseEnter={() => setHi(i)}
              onClick={() => choose(o.id)}
            >
              <span>{o.label}</span>{o.sub && <small className="muted">{o.sub}</small>}
            </li>
          ))}
          {matches.length === 0 && <li className="muted picker-none">No customer matches "{text}"</li>}
          {matches.length > MAX && <li className="muted picker-none">Showing {MAX} of {matches.length}. Keep typing to narrow it down.</li>}
        </ul>
      )}
    </div>
  )
}
