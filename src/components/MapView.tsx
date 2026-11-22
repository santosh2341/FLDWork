import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { addBaseLayers } from '../lib/mapLayers'

export interface Pin {
  id: string
  lat: number
  lng: number
  title: string
  detail: string
  href?: string
}

// OpenStreetMap tiles. Circle markers avoid bundling Leaflet's default icon images.
export default function MapView({ pins }: { pins: Pin[] }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!el.current || map.current) return
    map.current = L.map(el.current).setView([-25.3, 133.8], 4)
    addBaseLayers(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const m = map.current
    const g = layer.current
    if (!m || !g) return
    g.clearLayers()
    for (const p of pins) {
      const marker = L.circleMarker([p.lat, p.lng], { radius: 9, color: '#0a4d4d', fillColor: '#0f6b6b', fillOpacity: 0.85 })
      const box = document.createElement('div')
      const b = document.createElement('b')
      b.textContent = p.title
      box.append(b, document.createElement('br'), document.createTextNode(p.detail))
      if (p.href) {
        const a = document.createElement('a')
        a.href = p.href
        a.textContent = ' Open'
        box.append(document.createElement('br'), a)
      }
      marker.bindPopup(box)
      marker.addTo(g)
    }
    if (pins.length > 0) m.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 14 })
  }, [pins])

  return <div ref={el} className="map" />
}
