import L from 'leaflet'

// leaflet.markercluster is a UMD plugin that expects a global `L`; expose it before the plugin loads.
;(globalThis as unknown as { L: typeof L }).L = L

export default L
