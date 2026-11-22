import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { addBaseLayers } from '../lib/mapLayers'
import { AU_STATES, formatAddress, geocode, isBlank, stateLabel, validateAddress } from '../lib/address'
import type { AddressParts, AuState, GeoPoint } from '../lib/address'

export interface AddressValue {
  parts: AddressParts
  point: GeoPoint | null
}

// Australian address entry with a "find on map" step. The pin can be dragged (or the map clicked) to fine-tune the location.
export default function AddressFields({ value, onChange, label = 'Address' }: {
  value: AddressValue
  onChange: (v: AddressValue) => void
  label?: string
}) {
  const { parts, point } = value
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.Marker | null>(null)
  const latest = useRef(value)
  latest.current = value
  const emit = useRef(onChange)
  emit.current = onChange

  const set = (k: keyof AddressParts) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ parts: { ...parts, [k]: e.target.value as never }, point })

  const find = async () => {
    const err = validateAddress(parts)
    if (isBlank(parts)) return setStatus('Enter an address first.')
    if (err) return setStatus(err)
    setBusy(true)
    setStatus('Looking up…')
    try {
      const r = await geocode(parts)
      if (!r) setStatus('Could not find that address on the map. Check the suburb and postcode, or click the map to place the pin.')
      else {
        onChange({ parts, point: r.point })
        setStatus(r.precision === 'address' ? 'Located. Drag the pin if it needs adjusting.' : 'Exact street not found; pin is at the suburb. Drag it to the right spot.')
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Map lookup failed.')
    } finally {
      setBusy(false)
    }
  }

  // map is created once the form is shown; the pin follows `point`
  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { scrollWheelZoom: false }).setView([-25.3, 133.8], 3)
    addBaseLayers(m, 'satellite')
    m.on('click', (ev: L.LeafletMouseEvent) => emit.current({ parts: latest.current.parts, point: { lat: ev.latlng.lat, lng: ev.latlng.lng } }))
    map.current = m
    return () => { m.remove(); map.current = null; marker.current = null }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!point) { marker.current?.remove(); marker.current = null; return }
    const ll: L.LatLngTuple = [point.lat, point.lng]
    if (!marker.current) {
      marker.current = L.marker(ll, { draggable: true, icon: L.divIcon({ className: 'pin', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 22] }) }).addTo(m)
      marker.current.on('dragend', () => {
        const p = marker.current?.getLatLng()
        if (p) emit.current({ parts: latest.current.parts, point: { lat: p.lat, lng: p.lng } })
      })
    } else marker.current.setLatLng(ll)
    m.setView(ll, Math.max(m.getZoom(), 18))
  }, [point])

  return (
    <fieldset className="addr">
      <legend>{label}</legend>
      <div className="addr-grid">
        <label className="addr-wide">Street *<input value={parts.street} onChange={set('street')} placeholder="88 Southbank Boulevard" autoComplete="address-line1" /></label>
        <label className="addr-wide">Unit / level (optional)<input value={parts.unit} onChange={set('unit')} placeholder="e.g. 3 or Level 2" /></label>
        <label className="addr-wide">City / Suburb *<input value={parts.suburb} onChange={set('suburb')} placeholder="Southbank" autoComplete="address-level2" /></label>
        <label className="addr-2">State *
          <select value={parts.state} onChange={set('state')}>
            <option value="">Select…</option>
            {AU_STATES.map((s: AuState) => <option key={s} value={s}>{stateLabel(s)}</option>)}
          </select>
        </label>
        <label>Postcode *<input value={parts.postcode} onChange={set('postcode')} inputMode="numeric" maxLength={4} placeholder="3006" autoComplete="postal-code" /></label>
        <label className="addr-wide">Country<input value="Australia" readOnly disabled /></label>
      </div>
      <div className="row wrap">
        <button type="button" onClick={find} disabled={busy}>{busy ? 'Looking up…' : 'Find on map'}</button>
        <span className="muted">{formatAddress(parts).replace(/ • /g, "  •  ")}</span>
      </div>
      {status && <p className="muted">{status}</p>}
      <div ref={el} className="map small" />
      {point && <p className="muted">Location saved as {point.lat.toFixed(5)}, {point.lng.toFixed(5)}.</p>}
    </fieldset>
  )
}
