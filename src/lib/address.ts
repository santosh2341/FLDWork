// Australian street addresses: structured fields, one-line formatting, and geocoding via OpenStreetMap (Nominatim).

export const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const
export type AuState = (typeof AU_STATES)[number]

export const UNIT_TYPES = ['Unit', 'Apartment', 'Flat', 'Villa', 'Townhouse', 'Suite', 'Level', 'Shop', 'Warehouse', 'Factory', 'Office', 'Lot'] as const
// these are written as "3/88 Street"; the rest as "Level 4, 88 Street"
const SLASH_TYPES = ['Unit', 'Apartment', 'Flat', 'Villa', 'Townhouse']

export interface AddressParts {
  kind?: 'street' | 'po_box' // PO Box is for billing addresses only (it cannot be mapped)
  building?: string // building or complex name, e.g. "Collins Square"
  unitType?: string // one of UNIT_TYPES, or '' for none
  unit: string // unit / level / suite number, e.g. "3" or "4A"
  lot?: string // lot number for new estates and rural properties
  street: string // street number and name, e.g. "88 Southbank Boulevard"; for a PO Box, the box number
  suburb: string // city / suburb
  state: AuState | ''
  postcode: string // 4 digits
}

export const emptyAddress: AddressParts = { kind: 'street', building: '', unitType: '', unit: '', lot: '', street: '', suburb: '', state: '', postcode: '' }

export interface GeoPoint {
  lat: number
  lng: number
}

const clean = (s: string) => s.trim().replace(/\s+/g, ' ')

export function isBlank(a?: AddressParts | null) {
  return !a || !(a.street || a.suburb || a.postcode || a.unit || a.building || a.lot)
}

export const STATE_NAMES: Record<AuState, string> = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', WA: 'Western Australia',
  SA: 'South Australia', TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}
export const stateLabel = (s: AuState | '') => (s ? `${STATE_NAMES[s]} (${s})` : '')

// street line as written on an envelope: "Collins Square, Level 4, 88 Southbank Boulevard", "Unit 3/88 Southbank Boulevard", "Lot 12 Smith Road"
export function streetLine(a: AddressParts): string {
  if (a.kind === 'po_box') return clean(a.street).replace(/^po\s*box\s*/i, 'PO Box ').replace(/^(\d)/, 'PO Box $1')
  const street = [a.lot?.trim() ? `Lot ${clean(a.lot).replace(/^lot\s*/i, '')}` : '', clean(a.street)].filter(Boolean).join(' ')
  const unit = clean(a.unit)
  const type = a.unitType ?? ''
  let main = street
  if (unit) {
    if (type && SLASH_TYPES.includes(type)) main = `${type} ${unit}/${street}`
    else if (type) main = `${type} ${unit}, ${street}`
    else main = /^\d+[a-z]?$/i.test(unit) ? `${unit}/${street}` : `${unit}, ${street}`
  }
  return [clean(a.building ?? ''), main].filter(Boolean).join(', ')
}

// "Street: 88 Southbank Boulevard • City/Suburb: Southbank • State: Victoria (VIC) • Postcode: 3006 • Country: Australia"
export function formatAddress(a: AddressParts): string {
  if (isBlank(a)) return ''
  return [
    `${a.kind === 'po_box' ? 'Postal' : 'Street'}: ${streetLine(a)}`,
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
  return { kind: (r.kind as AddressParts['kind']) ?? 'street', building: r.building ?? '', unitType: r.unitType ?? '', unit: r.unit ?? '', lot: r.lot ?? '', street: street ?? '', suburb: r.suburb ?? '', state: (r.state ?? '') as AuState | '', postcode: r.postcode ?? '' }
}

// Reads the bullet format above, or a plain "14 Foundry Rd, Dandenong VIC 3175" line, so existing records can be edited.
export function parseAddress(text: string): AddressParts {
  const out = { ...emptyAddress }
  const t = clean(text)
  if (!t) return out
  if (/(Street|Postal):/i.test(t) || /City\/Suburb:/i.test(t)) {
    const field = (name: string) => t.match(new RegExp(`${name}:\\s*([^•]*)`, 'i'))?.[1]?.trim() ?? ''
    const line = field('Street') || field('Postal')
    if (/^Postal:/i.test(t) || /^PO Box/i.test(line)) { out.kind = 'po_box'; out.street = line.replace(/^PO Box\s*/i, '') }
    else {
      const parts = line.split(',').map((x) => x.trim())
      let main = parts.pop() ?? ''
      const lead = parts.join(', ')
      const m = main.match(/^(Unit|Apartment|Flat|Villa|Townhouse)\s+(\w+)\/(.+)$/i) ?? main.match(/^(\w+)\/(.+)$/)
      if (m && m.length === 4) { out.unitType = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(); out.unit = m[2]; main = m[3] }
      else if (m) { out.unit = m[1]; main = m[2] }
      const lot = main.match(/^Lot\s+(\w+)\s+(.+)$/i)
      if (lot) { out.lot = lot[1]; main = lot[2] }
      out.street = main
      const lv = lead.match(/(?:^|,\s*)(Level|Suite|Shop|Warehouse|Factory|Office)\s+(\w+)$/i)
      if (lv) { out.unitType = lv[1][0].toUpperCase() + lv[1].slice(1).toLowerCase(); out.unit = lv[2]; out.building = lead.slice(0, lead.length - lv[0].length).replace(/,\s*$/, '') }
      else out.building = lead
    }
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
  if (a.kind === 'po_box') {
    if (!clean(a.street)) return 'PO Box number is required.'
  } else if (!clean(a.street)) return 'Street is required (number and name, e.g. 88 Southbank Boulevard).'
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
  if (street && a.kind !== 'po_box') {
    const p = await search({ ...base, street }, signal)
    if (p) return { point: p, precision: 'address' }
  }
  const sub = await search(base, signal)
  return sub ? { point: sub, precision: 'suburb' } : null
}

// Short form for tight spaces, e.g. "140 George Street, Sydney". Falls back to the stored one-line text.
export function shortAddress(address?: string, parts?: AddressParts): string {
  if (parts && !isBlank(parts)) return [streetLine(parts), clean(parts.suburb)].filter(Boolean).join(', ')
  const m = /(?:Street|Postal):\s*(.*?)\s*•\s*City\/Suburb:\s*(.*?)\s*(?:•|$)/.exec(address ?? '')
  return m ? [m[1], m[2]].filter(Boolean).join(', ') : (address ?? '')
}
