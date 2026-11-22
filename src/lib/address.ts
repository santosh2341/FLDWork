// Australian street addresses: structured fields, one-line formatting, and geocoding via OpenStreetMap (Nominatim).

export const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const
export type AuState = (typeof AU_STATES)[number]

export interface AddressParts {
  unit: string // optional unit / flat / level, e.g. "3" or "Level 2"
  street: string // street number and name, e.g. "88 Southbank Boulevard"
  suburb: string // city / suburb
  state: AuState | ''
  postcode: string // 4 digits
}

export const emptyAddress: AddressParts = { unit: '', street: '', suburb: '', state: '', postcode: '' }

export interface GeoPoint {
  lat: number
  lng: number
}

const clean = (s: string) => s.trim().replace(/\s+/g, ' ')

export function isBlank(a?: AddressParts | null) {
  return !a || !(a.street || a.suburb || a.postcode || a.unit)
}

export const STATE_NAMES: Record<AuState, string> = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', WA: 'Western Australia',
  SA: 'South Australia', TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}
export const stateLabel = (s: AuState | '') => (s ? `${STATE_NAMES[s]} (${s})` : '')

// street line as written on an envelope: "3/88 Southbank Boulevard" or "Level 2, 88 Southbank Boulevard"
export function streetLine(a: AddressParts): string {
  const unit = clean(a.unit)
  const street = clean(a.street)
  if (!unit) return street
  return /^\d+[a-z]?$/i.test(unit) ? `${unit}/${street}` : `${unit}, ${street}`
}

// "Street: 88 Southbank Boulevard • City/Suburb: Southbank • State: Victoria (VIC) • Postcode: 3006 • Country: Australia"
export function formatAddress(a: AddressParts): string {
  if (isBlank(a)) return ''
  return [
    `Street: ${streetLine(a)}`,
    `City/Suburb: ${clean(a.suburb)}`,
    `State: ${stateLabel(a.state)}`,
    `Postcode: ${clean(a.postcode)}`,
    'Country: Australia',
  ].join(' • ')
}

// older records stored streetNumber + streetName separately
export function normalizeParts(raw: unknown): AddressParts | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, string>
  const street = r.street ?? [r.streetNumber, r.streetName].filter(Boolean).join(' ')
  return { unit: r.unit ?? '', street: street ?? '', suburb: r.suburb ?? '', state: (r.state ?? '') as AuState | '', postcode: r.postcode ?? '' }
}

// Reads the bullet format above, or a plain "14 Foundry Rd, Dandenong VIC 3175" line, so existing records can be edited.
export function parseAddress(text: string): AddressParts {
  const out = { ...emptyAddress }
  const t = clean(text)
  if (!t) return out
  if (/Street:/i.test(t) || /City\/Suburb:/i.test(t)) {
    const field = (name: string) => t.match(new RegExp(`${name}:\\s*([^•]*)`, 'i'))?.[1]?.trim() ?? ''
    out.street = field('Street')
    out.suburb = field('City/Suburb')
    out.postcode = field('Postcode').match(/\d{4}/)?.[0] ?? ''
    const st = field('State').match(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/i)
    out.state = st ? (st[1].toUpperCase() as AuState) : ''
    return out
  }
  const [first, ...rest] = t.split(',').map((x) => x.trim())
  out.street = first
  const tail = rest.join(' ')
  out.postcode = tail.match(/\b(\d{4})\b/)?.[1] ?? ''
  const st = tail.match(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/i)
  if (st) out.state = st[1].toUpperCase() as AuState
  out.suburb = clean(tail.replace(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/i, '').replace(/\b\d{4}\b/, ''))
  return out
}

export function validateAddress(a: AddressParts): string {
  if (isBlank(a)) return ''
  if (!clean(a.street)) return 'Street is required (number and name, e.g. 88 Southbank Boulevard).'
  if (!clean(a.suburb)) return 'City/Suburb is required.'
  if (!a.state) return 'Choose a state or territory.'
  if (!/^\d{4}$/.test(a.postcode.trim())) return 'Postcode must be 4 digits.'
  return ''
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
  const street = clean(a.street)
  const base: Record<string, string> = {}
  if (clean(a.suburb)) base.city = clean(a.suburb)
  if (state) base.state = state
  if (a.postcode.trim()) base.postalcode = a.postcode.trim()
  if (street) {
    const p = await search({ ...base, street }, signal)
    if (p) return { point: p, precision: 'address' }
  }
  const sub = await search(base, signal)
  return sub ? { point: sub, precision: 'suburb' } : null
}
