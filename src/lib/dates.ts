export const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const addDays = (s: string, n: number) => {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return fmtDate(d)
}
// Monday of the week containing the date
export const weekStart = (s: string) => {
  const d = parseDate(s)
  const dow = (d.getDay() + 6) % 7
  return addDays(s, -dow)
}
export const today = () => fmtDate(new Date())
// Show a YYYY-MM-DD date the Australian way (25/11/2026). Anything else is returned unchanged.
export const dmy = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : (iso ?? ''))
// A timestamp in Australian format, in the viewer's time zone: 27/11/2026, 1:52 pm
export const dmyTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')
// A YYYY-MM-DD date spelt out: Fri 27 Nov 2026
export const longDay = (d: string) => parseDate(d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
export const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
export const hoursBetween = (a: string, b: string) => (minutes(b) - minutes(a)) / 60
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Assign overlapping events to side-by-side lanes.
export function layoutLanes<T extends { start: string; end: string }>(items: T[]) {
  const sorted = [...items].sort((a, b) => minutes(a.start) - minutes(b.start))
  const laneEnds: number[] = []
  const placed = sorted.map((it) => {
    let lane = laneEnds.findIndex((end) => end <= minutes(it.start))
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(0)
    }
    laneEnds[lane] = minutes(it.end)
    return { item: it, lane }
  })
  return { placed, lanes: Math.max(1, laneEnds.length) }
}
