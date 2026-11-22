// Australian street addresses: structured fields, one-line formatting, and geocoding via OpenStreetMap (Nominatim).

export const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const
export type AuState = (typeof AU_STATES)[number]

export interface AddressParts {
  unit: string // unit / flat / level, e.g. "3" or "Level 2"
  streetNumber: string // e.g. "12" or "12A"
  streetName: string // e.g. "Smith Street"
  suburb: string
  state: AuState | ''
  postcode: string // 4 digits
}

export const emptyAddress: AddressParts = { unit: '', streetNumber: '', streetName: '', suburb: '', state: '', postcode: '' }

export interface GeoPoint {
  lat: number
  lng: number
}

const clean = (s: string) => s.trim().replace(/\s+/g, ' ')

export function isBlank(a?: AddressParts | null) {
  return !a || !(a.streetNumber || a.streetName || a.suburb || a.postcode || a.unit)
}

// "3/12 Smith Street, Parramatta NSW 2150" (unit before the street number, as Australia Post writes it)
export function formatAddress(a: AddressParts): string {
  const unit = clean(a.unit)
  const num = clean(a.streetNumber)
  const street = clean(a.streetName)
  const line1 = [unit && /^\d+[a-z]?$/i.test(unit) && num ? `${unit}/${num}` : [unit, num].filter(Boolean).join(' '), street].filter(Boolean).join(' ')
  const locality = [clean(a.suburb), a.state, clean(a.postcode)].filter(Boolean).join(' ')
  return [line1, locality].filter(Boolean).join(', ')
}

// Best-effort split of an old one-line address ("14 Foundry Rd, Dandenong VIC 3175") so existing records can be edited.
export function parseAddress(text: string): AddressParts {
  const out = { ...emptyAddress }
  const t = clean(text)
  if (!t) return out
  const [first, ...rest] = t.split(',').map((x) => x.trim())
  const m = first.match(/^(?:(\d+[A-Za-z]?)\s*\/\s*)?(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s+(.+)$/)
  if (m) {
    out.unit = m[1] ?? ''
    out.streetNumber = m[2]
    out.streetName = m[3]
  } else out.streetName = first
  const tail = rest.join(' ')
  const pc = tail.match(/\b(\d{4})\b/)
  if (pc) out.postcode = pc[1]
  const st = tail.match(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/i)
  if (st) out.state = st[1].toUpperCase() as AuState
  out.suburb = clean(tail.replace(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/i, '').replace(/\b\d{4}\b/, ''))
  return out
}

export function validateAddress(a: AddressParts): string {
  if (isBlank(a)) return ''
  if (a.postcode && !/^\d{4}$/.test(a.postcode.trim())) return 'Postcode must be 4 digits.'
  if (!clean(a.suburb)) return 'Suburb is required.'
  if (!a.state) return 'Choose a state or territory.'
  if (!clean(a.streetName)) return 'Street name is required.'
  return ''
}

const STATE_NAMES: Record<AuState, string> = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', WA: 'Western Australia',
  SA: 'South Australia', TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}

interface NominatimHit { lat: string; lon: string }

async function search(params: Record<string, string>, signal?: AbortSignal): Promise<GeoPoint | null> {
  const q = new URLSearchParams({ format: 'jsonv2', countrycodes: 'au', limit: '1', ...params })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Map lookup failed (${res.status}). Try again in a moment.`)
  const hits = (await res.json()) as NominatimHit[]
  if (!hits.length) return null
  const lat = Number(hits[0].lat)
  const lng = Number(hits[0].lon)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

export interface GeocodeResult { point: GeoPoint; precision: 'address' | 'suburb' }

// Street address first; if OpenStreetMap doesn't know the exact number, fall back to the suburb + postcode centre.
export async function geocode(a: AddressParts, signal?: AbortSignal): Promise<GeocodeResult | null> {
  const state = a.state ? STATE_NAMES[a.state] : ''
  const street = [clean(a.streetNumber), clean(a.streetName)].filter(Boolean).join(' ')
  const base: Record<string, string> = {}
  if (clean(a.suburb)) base.city = clean(a.suburb)
  if (state) base.state = state
  if (a.postcode.trim()) base.postalcode = a.postcode.trim()
  if (street && clean(a.streetName)) {
    const p = await search({ ...base, street }, signal)
    if (p) return { point: p, precision: 'address' }
  }
  const sub = await search(base, signal)
  return sub ? { point: sub, precision: 'suburb' } : null
}
