import type { EvidenceType, IssueCategory } from '@/types'

/**
 * Generates an SVG illustration used in place of a real photograph for demo records.
 * Every image carries a visible "Demo placeholder" label so it can never be mistaken for real evidence.
 */
const PALETTE: Record<IssueCategory, { bg: string; fg: string; accent: string }> = {
  garbage: { bg: '#e6f4f1', fg: '#0f766e', accent: '#99d5c9' },
  drainage: { bg: '#e0f2fe', fg: '#0369a1', accent: '#93c5fd' },
  pothole: { bg: '#fdf3e7', fg: '#92400e', accent: '#f5c58a' },
  other: { bg: '#f2f4f7', fg: '#475467', accent: '#d0d5dd' },
}

const SCENES: Record<IssueCategory, string> = {
  garbage:
    '<rect x="150" y="120" width="70" height="90" rx="6" fill="FG" opacity=".85"/><rect x="142" y="108" width="86" height="14" rx="4" fill="FG"/><circle cx="250" cy="196" r="22" fill="ACC"/><circle cx="282" cy="200" r="16" fill="ACC"/><circle cx="118" cy="200" r="14" fill="ACC"/><path d="M230 210 l20 -30 l18 30z" fill="ACC"/>',
  drainage:
    '<rect x="60" y="170" width="280" height="40" fill="FG" opacity=".2"/><path d="M60 180 q35 -14 70 0 t70 0 t70 0 t70 0" stroke="FG" stroke-width="6" fill="none"/><path d="M60 196 q35 -14 70 0 t70 0 t70 0 t70 0" stroke="FG" stroke-width="4" fill="none" opacity=".6"/><rect x="170" y="110" width="60" height="50" rx="4" fill="none" stroke="FG" stroke-width="5"/><path d="M182 122 v26 M194 122 v26 M206 122 v26 M218 122 v26" stroke="FG" stroke-width="3"/>',
  pothole:
    '<path d="M40 210 L160 100 L240 100 L360 210 Z" fill="FG" opacity=".18"/><path d="M200 110 v14 M200 140 v14 M200 172 v18" stroke="#fff" stroke-width="5"/><ellipse cx="236" cy="170" rx="44" ry="16" fill="FG"/><ellipse cx="236" cy="166" rx="34" ry="10" fill="ACC"/><path d="M120 150 l14 -36 l14 36z" fill="#f97316"/><rect x="116" y="148" width="36" height="6" fill="#f97316"/>',
  other:
    '<circle cx="200" cy="150" r="46" fill="none" stroke="FG" stroke-width="6"/><path d="M186 136 q14 -20 28 0 q0 12 -14 18 v10" stroke="FG" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="200" cy="176" r="4" fill="FG"/>',
}

const TYPE_LABEL: Record<EvidenceType, string> = {
  original: 'Reported condition',
  progress: 'Work in progress',
  resolution: 'After resolution',
  other: 'Supporting image',
}

const cache = new Map<string, string>()

export function placeholderSvg(category: IssueCategory, type: EvidenceType): string {
  const key = `${category}:${type}`
  const hit = cache.get(key)
  if (hit) return hit
  const p = PALETTE[category]
  const resolved = type === 'resolution'
  const scene = resolved
    ? `<circle cx="200" cy="150" r="52" fill="#dcfae6"/><path d="M174 150 l18 18 l34 -36" stroke="#079455" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : SCENES[category].replaceAll('FG', p.fg).replaceAll('ACC', p.accent)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" width="400" height="260"><rect width="400" height="260" fill="${resolved ? '#ecfdf3' : p.bg}"/>${scene}<rect x="0" y="226" width="400" height="34" fill="#101828" opacity=".72"/><text x="12" y="248" font-family="Inter,Arial,sans-serif" font-size="13" fill="#fff">${TYPE_LABEL[type]} · DEMO PLACEHOLDER — not a real photo</text></svg>`
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  cache.set(key, url)
  return url
}

/** Resolves an evidence URL: either a generated placeholder token or a real/data URL. */
export function resolveEvidenceUrl(url: string): string {
  if (url.startsWith('placeholder:')) {
    const [, category, type] = url.split(':')
    return placeholderSvg(category as IssueCategory, type as EvidenceType)
  }
  return url
}
