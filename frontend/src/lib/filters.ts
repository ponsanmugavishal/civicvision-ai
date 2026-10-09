import { CATEGORY_DEPARTMENT } from '@/data/directory'
import { getDeadlineInfo } from '@/lib/domain'
import type { PublicReport, Report, ReportFilters } from '@/types'

/** Shared report filter predicate (used by the mock service and client-side lists). */
export function matchesFilters(r: Report | PublicReport, f: ReportFilters | undefined, now = Date.now()): boolean {
  if (!f) return true
  if (f.categories?.length && !f.categories.includes(r.category)) return false
  if (f.statuses?.length && !f.statuses.includes(r.status)) return false
  if (f.severities?.length && !f.severities.includes(r.severity)) return false
  if (f.departmentIds?.length) {
    const dept = r.departmentId ?? CATEGORY_DEPARTMENT[r.category]
    if (!f.departmentIds.includes(dept)) return false
  }
  if (f.zoneIds?.length && (!r.zoneId || !f.zoneIds.includes(r.zoneId))) return false
  if (f.dateFrom && new Date(r.reportedAt) < new Date(f.dateFrom)) return false
  if (f.dateTo && new Date(r.reportedAt) > new Date(`${f.dateTo}T23:59:59.999`)) return false
  if (f.overdueOnly && getDeadlineInfo(r, now).state !== 'overdue') return false
  if (f.search?.trim()) {
    const q = f.search.trim().toLowerCase()
    const hay = `${r.publicId} ${r.category} ${r.address} ${r.landmark} ${r.description}`.toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}
