import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from '@/lib/leaflet'
import 'leaflet.markercluster'
import type { PublicReport, Report } from '@/types'
import { markerIcon, markerTitle, visualFor } from './markerIcon'

interface ReportMarkersProps {
  reports: (Report | PublicReport)[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Fit the map to the markers whenever the set of reports changes. */
  fitOnChange?: boolean
  cluster?: boolean
  /** Pixels covered by an overlay on the right edge; selected markers are centred in the remaining area. */
  padRight?: number
}

/** Renders report markers with clustering (leaflet.markercluster) and keeps selection in sync. */
export function ReportMarkers({ reports, selectedId, onSelect, fitOnChange = false, cluster = true, padRight = 0 }: ReportMarkersProps) {
  const map = useMap()
  const groupRef = useRef<L.FeatureGroup | null>(null)
  const markersRef = useRef(new Map<string, { marker: L.Marker; report: Report | PublicReport }>())
  const onSelectRef = useRef(onSelect)
  const selectedRef = useRef(selectedId)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    const group = cluster
      ? L.markerClusterGroup({
          showCoverageOnHover: false,
          maxClusterRadius: 44,
          spiderfyOnMaxZoom: true,
          iconCreateFunction: (c) => {
            const children = c.getAllChildMarkers()
            const overdue = children.some((m) => (m.options as { cvOverdue?: boolean }).cvOverdue)
            const n = c.getChildCount()
            const size = n < 10 ? 34 : n < 50 ? 40 : 46
            return L.divIcon({
              html: `<div style="width:${size}px;height:${size}px" aria-label="${n} complaints${overdue ? ', some overdue' : ''}">${n}</div>`,
              className: `marker-cluster-custom${overdue ? ' has-overdue' : ''}`,
              iconSize: [size, size],
            })
          },
        })
      : L.featureGroup()
    group.addTo(map)
    groupRef.current = group
    return () => {
      group.remove()
      groupRef.current = null
    }
  }, [map, cluster])

  // Rebuild markers when the report set changes.
  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    group.clearLayers()
    markersRef.current.clear()
    const now = Date.now()
    const markers = reports.map((r) => {
      const v = visualFor(r, now)
      const marker = L.marker([r.latitude, r.longitude], {
        icon: markerIcon(v, r.id === selectedRef.current),
        title: markerTitle(r),
        alt: markerTitle(r),
        keyboard: true,
        riseOnHover: true,
        zIndexOffset: v.deadline === 'overdue' ? 500 : r.severity === 'critical' ? 300 : 0,
        cvOverdue: v.deadline === 'overdue',
      } as L.MarkerOptions)
      // `keyboard: true` makes markers focusable; Leaflet fires `click` on Enter.
      marker.on('click', () => onSelectRef.current?.(r.id))
      markersRef.current.set(r.id, { marker, report: r })
      return marker
    })
    if (group instanceof L.MarkerClusterGroup) group.addLayers(markers)
    else markers.forEach((m) => group.addLayer(m))
    if (fitOnChange && markers.length) {
      const bounds = L.latLngBounds(reports.map((r) => [r.latitude, r.longitude] as [number, number]))
      map.fitBounds(bounds.pad(0.08), { maxZoom: 16, animate: false })
    }
  }, [reports, map, fitOnChange, cluster])

  // Update selection styling and bring the selected marker into view.
  useEffect(() => {
    const prev = selectedRef.current
    selectedRef.current = selectedId
    const now = Date.now()
    if (prev && prev !== selectedId) {
      const p = markersRef.current.get(prev)
      p?.marker.setIcon(markerIcon(visualFor(p.report, now), false))
    }
    if (!selectedId) return
    const s = markersRef.current.get(selectedId)
    if (!s) return
    s.marker.setIcon(markerIcon(visualFor(s.report, now), true))
    const reveal = () => {
      const size = map.getSize()
      const pt = map.latLngToContainerPoint(s.marker.getLatLng())
      const visibleW = size.x - padRight
      if (pt.x < 40 || pt.x > visibleW - 40 || pt.y < 40 || pt.y > size.y - 40) {
        const target = map.project(s.marker.getLatLng()).add([padRight / 2, 0])
        map.panTo(map.unproject(target))
      }
    }
    const group = groupRef.current
    if (group instanceof L.MarkerClusterGroup) group.zoomToShowLayer(s.marker, reveal)
    else reveal()
  }, [selectedId, map, reports, padRight])

  return null
}
