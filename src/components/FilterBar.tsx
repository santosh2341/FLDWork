import { useSearchParams } from 'react-router-dom'

// A "?filter=…" value in the address, with a bar that says what is filtered and lets people clear it.
export function useFilter(): string {
  const [p] = useSearchParams()
  return p.get('filter') ?? ''
}

export default function FilterBar({ label, shown, total }: { label: string; shown: number; total: number }) {
  const [p, setP] = useSearchParams()
  if (!p.get('filter')) return null
  return (
    <div className="filter-bar">
      <span>Showing <b>{shown}</b> of {total}: {label}</span>
      <button onClick={() => { p.delete('filter'); setP(p) }}>Show all</button>
    </div>
  )
}

// True when the page was opened from a "Create" shortcut (?new=1), so its form can start open.
export function useStartOpen(): boolean {
  const [p] = useSearchParams()
  return p.get('new') === '1'
}
