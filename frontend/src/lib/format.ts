const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const shortDateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })

export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFmt.format(new Date(iso)) : '—'
}

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : '—'
}

export function formatShortDate(iso: string): string {
  return shortDateFmt.format(new Date(iso))
}

/** Human duration such as "3d 4h" or "45m". */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms)
  const minutes = Math.floor(abs / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days >= 1) {
    const h = hours % 24
    return h ? `${days}d ${h}h` : `${days}d`
  }
  if (hours >= 1) {
    const m = minutes % 60
    return m ? `${hours}h ${m}m` : `${hours}h`
  }
  return `${Math.max(minutes, 1)}m`
}

export function formatRelative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now
  const d = formatDuration(diff)
  return diff >= 0 ? `in ${d}` : `${d} ago`
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
