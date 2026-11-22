import L from 'leaflet'

// Street map (OpenStreetMap) plus satellite imagery (Esri), so houses and lots are visible. Satellite is the default for address pinning.
export function addBaseLayers(map: L.Map, defaultLayer: 'street' | 'satellite' = 'street') {
  const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  })
  const satellite = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    }),
    // street names and suburb labels on top of the imagery
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
  ])
  ;(defaultLayer === 'satellite' ? satellite : street).addTo(map)
  L.control.layers({ Street: street, Satellite: satellite }, undefined, { position: 'topright', collapsed: false }).addTo(map)
}
