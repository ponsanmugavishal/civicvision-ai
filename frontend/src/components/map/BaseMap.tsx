import { MapPinOff } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { env } from '@/config/env'
import { cn } from '@/lib/cn'

/** Keeps Leaflet's size in sync with flex/grid layouts that resize without a window resize. */
function ResizeWatcher() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])
  return null
}

interface BaseMapProps {
  center?: [number, number]
  zoom?: number
  className?: string
  children?: ReactNode
  label: string
  overlay?: ReactNode
  /** Absolutely fill the nearest positioned ancestor instead of sizing via className. */
  fill?: boolean
}

/**
 * OpenStreetMap-backed Leaflet map. If tiles fail to load (offline, blocked network) a clear
 * notice is shown while markers and the rest of the interface stay usable.
 */
export function BaseMap({ center = env.map.center, zoom = env.map.zoom, className, children, label, overlay, fill }: BaseMapProps) {
  const [tileErrors, setTileErrors] = useState(0)
  const [tilesLoaded, setTilesLoaded] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const tilesFailed = !online || (tileErrors >= 3 && !tilesLoaded)

  return (
    <div className={cn(fill ? 'absolute inset-0' : 'relative', 'isolate overflow-hidden', className)} role="region" aria-label={label}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom className="h-full w-full" zoomControl attributionControl>
        <TileLayer
          url={env.map.tileUrl}
          attribution={env.map.attribution}
          maxZoom={19}
          eventHandlers={{
            tileerror: () => setTileErrors((n) => n + 1),
            tileload: () => setTilesLoaded(true),
          }}
        />
        <ResizeWatcher />
        {children}
      </MapContainer>
      {tilesFailed && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] flex justify-center">
          <div role="status" className="pointer-events-auto flex max-w-md items-start gap-2 rounded-lg border border-orange-200 bg-orange-50/95 px-3 py-2 text-sm text-orange-900 shadow-card">
            <MapPinOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Map background tiles could not load{!online ? ' (you appear to be offline)' : ''}. Markers, the list and all actions still work.
            </span>
          </div>
        </div>
      )}
      {overlay}
    </div>
  )
}
