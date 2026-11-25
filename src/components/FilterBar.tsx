import { useSearchParams } from 'react-router-dom'

// A bar that says what a "?filter=…" link is showing and lets people clear it. The hooks live in useFilter.ts.
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

