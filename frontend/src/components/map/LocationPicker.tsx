import type { Marker as LeafletMarker } from 'leaflet'
import { Crosshair, LocateFixed } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Marker, useMap, useMapEvents } from 'react-leaflet'
import { Button } from '@/components/ui/Button'
import { formatCoords } from '@/lib/format'
import { BaseMap } from './BaseMap'
import { pinIcon } from './markerIcon'

export interface PickedLocation {
  lat: number
  lng: number
  accuracy?: number
  source: 'map' | 'gps' | 'drag'
}

function ClickHandler({ onPick }: { onPick: (p: PickedLocation) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng, source: 'map' }),
  })
  return null
}

function FlyTo({ target }: { target: PickedLocation | null }) {
  const map = useMap()
  useEffect(() => {
    if (target?.source === 'gps') map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 17), { duration: 0.8 })
  }, [target, map])
  return null
}

interface LocationPickerProps {
  value: PickedLocation | null
  onChange: (p: PickedLocation) => void
  error?: string
}

export function LocationPicker({ value, onChange, error }: LocationPickerProps) {
  const [geoState, setGeoState] = useState<'idle' | 'locating' | 'error'>('idle')
  const [geoMessage, setGeoMessage] = useState<string | null>(null)

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setGeoState('error')
      setGeoMessage('Your browser does not support location access. Click on the map instead.')
      return
    }
    setGeoState('locating')
    setGeoMessage(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoState('idle')
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, source: 'gps' })
        setGeoMessage(`Location found (±${Math.round(pos.coords.accuracy)} m). Drag the pin to adjust if needed.`)
      },
      (err) => {
        setGeoState('error')
        setGeoMessage(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Click on the map to place the pin instead.'
            : 'Could not determine your location. Click on the map to place the pin instead.',
        )
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm text-ink-soft">
          <Crosshair className="size-4 text-ink-muted" aria-hidden />
          Click the map to drop a pin, or use your current location.
        </p>
        <Button size="sm" variant="secondary" onClick={locate} loading={geoState === 'locating'} icon={<LocateFixed className="size-4" />}>
          Use my location
        </Button>
      </div>
      <BaseMap label="Location picker map" className={`h-72 rounded-lg border sm:h-80 ${error ? 'border-red-400' : 'border-line'}`}>
        <ClickHandler onPick={onChange} />
        <FlyTo target={value} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            icon={pinIcon}
            draggable
            title="Selected complaint location"
            eventHandlers={{
              dragend: (e) => {
                const ll = (e.target as LeafletMarker).getLatLng()
                onChange({ lat: ll.lat, lng: ll.lng, source: 'drag' })
              },
            }}
          />
        )}
      </BaseMap>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span aria-live="polite" className={value ? 'text-ink' : 'text-ink-muted'}>
          {value ? (
            <>
              Selected: <span className="font-mono">{formatCoords(value.lat, value.lng)}</span>
            </>
          ) : (
            'No location selected yet.'
          )}
        </span>
        {geoMessage && <span className={geoState === 'error' ? 'text-orange-700' : 'text-ink-muted'}>{geoMessage}</span>}
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}
