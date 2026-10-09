import L from '@/lib/leaflet'
import { CATEGORY_META, getDeadlineInfo, SEVERITY_META } from '@/lib/domain'
import type { DeadlineState, IssueCategory, PublicReport, Report, Severity } from '@/types'

const GLYPH: Record<IssueCategory, string> = {
  garbage: '<path d="M5.5 2h5v1.5H14V5H2V3.5h3.5z"/><path d="M3.4 6h9.2l-.9 8.2H4.3z"/>',
  drainage: '<path d="M8 1.5c2.6 3.3 4.6 5.6 4.6 8.1a4.6 4.6 0 0 1-9.2 0c0-2.5 2-4.8 4.6-8.1z"/>',
  pothole: '<path d="M6.6 2h2.8l3 9.6H3.6z"/><path d="M2 12.4h12V14H2z"/>',
  other: '<path d="M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8zm.1 10.4a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8zm1.1-3.8c-.5.3-.6.5-.6.9v.3H7.3v-.4c0-.9.4-1.4 1-1.8.5-.3.7-.5.7-.9 0-.4-.4-.7-.9-.7-.5 0-.9.3-1 .9L5.8 6.4C6 5.2 6.9 4.4 8.2 4.4c1.3 0 2.2.8 2.2 1.9 0 .9-.5 1.5-1.2 2.1z"/>',
}
const CHECK = '<path d="M6.4 11.6 2.8 8l1.2-1.2 2.4 2.4 5.6-5.6L13.2 4.8z"/>'

const SIZE: Record<Severity, number> = { low: 24, medium: 26, high: 28, critical: 32 }

const cache = new Map<string, L.DivIcon>()

export interface MarkerVisual {
  category: IssueCategory
  severity: Severity
  resolved: boolean
  rejected: boolean
  deadline: DeadlineState
}

export function visualFor(r: Report | PublicReport, now = Date.now()): MarkerVisual {
  return {
    category: r.category,
    severity: r.severity,
    resolved: r.status === 'resolved',
    rejected: r.status === 'rejected',
    deadline: getDeadlineInfo(r, now).state,
  }
}

/**
 * Marker encoding (kept deliberately separate):
 *   • Fill colour + size  → severity (low/medium/high/critical); green check = resolved; grey = rejected.
 *   • Corner badge        → deadline status (orange clock = due soon, red "!" with pulse ring = overdue).
 */
export function markerIcon(v: MarkerVisual, selected = false): L.DivIcon {
  const key = `${v.category}|${v.severity}|${v.resolved}|${v.rejected}|${v.deadline}|${selected}`
  const hit = cache.get(key)
  if (hit) return hit

  const size = SIZE[v.severity]
  const fill = v.resolved ? '#079455' : v.rejected ? '#98a2b3' : SEVERITY_META[v.severity].color
  const glyph = v.resolved ? CHECK : GLYPH[v.category]
  const overdue = v.deadline === 'overdue'
  const approaching = v.deadline === 'approaching'
  const badge = overdue
    ? `<span style="position:absolute;top:-5px;right:-6px;width:15px;height:15px;border-radius:50%;background:#d92d20;border:2px solid #fff;color:#fff;font:700 10px/11px Inter,sans-serif;text-align:center">!</span>`
    : approaching
      ? `<span style="position:absolute;top:-5px;right:-6px;width:15px;height:15px;border-radius:50%;background:#f79009;border:2px solid #fff;display:flex;align-items:center;justify-content:center"><svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.4"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.2 1.6"/></svg></span>`
      : ''
  const pulse = overdue ? `<span class="cv-pulse" style="position:absolute;inset:-4px;border-radius:50%;border:2px solid #d92d20"></span>` : ''
  const html = `<div style="position:relative;width:${size}px;height:${size}px">${pulse}<div class="cv-marker-body" style="width:${size}px;height:${size}px;border-radius:50%;background:${fill};border:2px solid #fff;box-shadow:0 1px 4px rgba(16,24,40,.35);display:flex;align-items:center;justify-content:center"><svg width="${Math.round(size * 0.52)}" height="${Math.round(size * 0.52)}" viewBox="0 0 16 16" fill="#fff" aria-hidden="true">${glyph}</svg></div>${badge}</div>`

  const icon = L.divIcon({
    html,
    className: `cv-marker${selected ? ' cv-marker-selected' : ''}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
  cache.set(key, icon)
  return icon
}

export function markerTitle(r: Report | PublicReport): string {
  const v = visualFor(r)
  const dl = v.deadline === 'overdue' ? ', overdue' : v.deadline === 'approaching' ? ', due soon' : ''
  return `${r.publicId}: ${CATEGORY_META[r.category].short}, ${SEVERITY_META[r.severity].label} severity, ${r.status.replace('_', ' ')}${dl}`
}

export const pinIcon = L.divIcon({
  className: 'cv-pin',
  html: `<svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true"><path d="M17 1C8.2 1 1 8 1 16.6 1 28.3 17 43 17 43s16-14.7 16-26.4C33 8 25.8 1 17 1z" fill="#1d4ed8" stroke="#fff" stroke-width="2"/><circle cx="17" cy="16.5" r="6" fill="#fff"/></svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 43],
})
