import { LocateFixed, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Circle, CircleMarker, useMap } from 'react-leaflet'
import L from '@/lib/leaflet'
import { cn } from '@/lib/cn'

interface Fix {
  lat: number
  lng: number
  accuracy: number
}

/**
 * "My location" button for any map. Uses the browser's geolocation (asks permission on click).
 * If permission was already granted earlier, the map centres on the user automatically when it opens.
 * The position is only shown on the user's own screen — it is never sent to the server.
 */
export function LocateControl({ autoIfGranted = true, zoom = 16 }: { autoIfGranted?: boolean; zoom?: number }) {
  const map = useMap()
  const [fix, setFix] = useState<Fix | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const watchId = useRef<number | null>(null)
  const box = useRef<HTMLDivElement>(null)

  // Stop clicks/scrolls on the button from reaching the map (e.g. dropping a pin in the location picker).
  useEffect(() => {
    if (box.current) {
      L.DomEvent.disableClickPropagation(box.current)
      L.DomEvent.disableScrollPropagation(box.current)
    }
  }, [])

  const locate = useCallback(
    (fly: boolean) => {
      if (!('geolocation' in navigator)) {
        setMessage('Your browser does not support location.')
        return
      }
      setBusy(true)
      setMessage(null)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const f = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
          setFix(f)
          setBusy(false)
          if (fly) map.flyTo([f.lat, f.lng], Math.max(map.getZoom(), zoom), { duration: 0.8 })
          // Keep the dot following the user while the map is open.
          if (watchId.current === null) {
            watchId.current = navigator.geolocation.watchPosition(
              (p) => setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
              () => undefined,
              { enableHighAccuracy: true, maximumAge: 15_000 },
            )
          }
        },
        (err) => {
          setBusy(false)
          setMessage(
            err.code === err.PERMISSION_DENIED
              ? 'Location is blocked. Allow it in your browser’s site settings (lock icon in the address bar).'
              : 'Could not find your location. Try again outdoors or check that location is turned on.',
          )
        },
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
      )
    },
    [map, zoom],
  )

  // Auto-centre only when the user has already granted permission (never pops a prompt on page load).
  useEffect(() => {
    if (!autoIfGranted || !navigator.permissions?.query) return
    let cancelled = false
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((s) => {
        if (!cancelled && s.state === 'granted') locate(true)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [autoIfGranted, locate])

  useEffect(
    () => () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    },
    [],
  )

  return (
    <>
      {fix && (
        <>
          <Circle center={[fix.lat, fix.lng]} radius={Math.min(fix.accuracy, 500)} pathOptions={{ color: '#2563eb', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.12 }} interactive={false} />
          <CircleMarker center={[fix.lat, fix.lng]} radius={7} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }} interactive={false} />
        </>
      )}
      <div className="leaflet-top leaflet-left" style={{ top: 80 }}>
        <div ref={box} className="leaflet-control flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              locate(true)
            }}
            className={cn('flex size-[34px] items-center justify-center rounded-md border-2 border-black/20 bg-white text-ink-soft shadow-sm hover:bg-slate-50', fix && 'text-brand-700')}
            aria-label="Show my location"
            title="Show my location"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}
          </button>
          {message && (
            <p role="status" className="max-w-56 rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-xs text-orange-900 shadow-sm">
              {message}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
