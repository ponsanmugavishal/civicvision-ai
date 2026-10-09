import { Circle, Tooltip } from 'react-leaflet'
import type { Hotspot } from '@/types'

/** Draws recurring-problem hotspots as translucent circles sized by report count. */
export function HotspotLayer({ hotspots, selectedId, onSelect }: { hotspots: Hotspot[]; selectedId?: string | null; onSelect?: (id: string) => void }) {
  return (
    <>
      {hotspots.map((h) => {
        const selected = h.id === selectedId
        const color = h.activeCount >= 3 ? '#d92d20' : h.activeCount >= 1 ? '#f79009' : '#1d4ed8'
        return (
          <Circle
            key={h.id}
            center={[h.latitude, h.longitude]}
            radius={120 + h.count * 25}
            pathOptions={{ color, weight: selected ? 3 : 1.5, fillColor: color, fillOpacity: selected ? 0.3 : 0.16 }}
            eventHandlers={{ click: () => onSelect?.(h.id) }}
          >
            <Tooltip direction="top">
              <strong>{h.count} reports</strong> · {h.activeCount} still active
            </Tooltip>
          </Circle>
        )
      })}
    </>
  )
}
