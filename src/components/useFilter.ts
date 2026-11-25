import { useSearchParams } from 'react-router-dom'

// A "?filter=…" value in the address. FilterBar shows what is filtered and lets people clear it.
export function useFilter(): string {
  const [p] = useSearchParams()
  return p.get('filter') ?? ''
}

// True when the page was opened from a "Create" shortcut (?new=1), so its form can start open.
export function useStartOpen(): boolean {
  const [p] = useSearchParams()
  return p.get('new') === '1'
}
