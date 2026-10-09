/**
 * HTTP implementation of CivicApi against the FastAPI backend (VITE_DATA_MODE=api).
 * Authorisation is enforced by the server; the `user` arguments exist only to share the contract with demo mode.
 */
import { env } from '@/config/env'
import type { AiClassifyResult, AppNotification, DuplicateCandidate, Evidence, Feedback, PublicReport, Report, ReportFilters } from '@/types'
import { bumpData } from '../dataEvents'
import { ApiError } from '../errors'
import { http } from '../httpClient'
import type { CivicApi, DepartmentStats, DisputeRow, EscalationRow, ExtensionRow, ScopedReportRow, SummaryStats, TrendPoint, WorkBundle } from '../types'

function qs(f?: ReportFilters, extra: Record<string, string | number | undefined> = {}): string {
  const p = new URLSearchParams()
  if (f?.search?.trim()) p.set('search', f.search.trim())
  if (f?.categories?.length) p.set('categories', f.categories.join(','))
  if (f?.statuses?.length) p.set('statuses', f.statuses.join(','))
  if (f?.severities?.length) p.set('severities', f.severities.join(','))
  if (f?.departmentIds?.length) p.set('departmentIds', f.departmentIds.join(','))
  if (f?.zoneIds?.length) p.set('zoneIds', f.zoneIds.join(','))
  if (f?.dateFrom) p.set('dateFrom', f.dateFrom)
  if (f?.dateTo) p.set('dateTo', f.dateTo)
  if (f?.overdueOnly) p.set('overdueOnly', 'true')
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Local-storage media URLs are relative to the API origin; Supabase signed URLs are absolute. */
function absolute(e: Evidence): Evidence {
  return e.url.startsWith('/') ? { ...e, url: `${env.apiBaseUrl}${e.url}` } : e
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

async function write<T>(path: string, init: RequestInit): Promise<T> {
  const result = await http<T>(path, init)
  bumpData()
  return result
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}

export const httpApi: CivicApi = {
  directory: {
    departments: () => http('/api/directory/departments'),
    zones: () => http('/api/directory/zones'),
    staff: (departmentId) => http(`/api/directory/staff${departmentId ? `?department_id=${encodeURIComponent(departmentId)}` : ''}`),
    slaPolicies: () => http('/api/directory/sla-policies'),
  },

  publicReports: {
    list: (filters) => http<PublicReport[]>(`/api/public/reports${qs(filters)}`),
    async get(id) {
      const b = await http<{ report: PublicReport; timeline: never; evidence: Evidence[] }>(`/api/public/reports/${id}`)
      return { ...b, evidence: b.evidence.map(absolute) }
    },
    async findByPublicId(publicId) {
      try {
        return await http<PublicReport>(`/api/public/reports/by-public-id/${encodeURIComponent(publicId.trim())}`)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null
        throw e
      }
    },
  },

  citizen: {
    async create(_user, input) {
      const fd = new FormData()
      fd.set('category', input.category)
      fd.set('description', input.description)
      fd.set('latitude', String(input.latitude))
      fd.set('longitude', String(input.longitude))
      fd.set('address', input.address)
      fd.set('landmark', input.landmark)
      if (input.aiSuggestionId) fd.set('aiSuggestionId', input.aiSuggestionId)
      fd.set('photo', await dataUrlToBlob(input.photoDataUrl), 'photo.jpg')
      return write<Report>('/api/reports', { method: 'POST', body: fd })
    },
    mine: () => http<Report[]>('/api/reports/mine'),
    async get(_user, id) {
      const b = await http<{ report: Report; timeline: never; evidence: Evidence[]; feedback: Feedback[] }>(`/api/reports/mine/${id}`)
      return { ...b, evidence: b.evidence.map(absolute) }
    },
    findDuplicates: (_user, input) => {
      const p = new URLSearchParams({ lat: String(input.latitude), lng: String(input.longitude), category: input.category, description: input.description.slice(0, 500) })
      return http<DuplicateCandidate[]>(`/api/duplicates?${p}`)
    },
    submitFeedback: (_user, reportId, input) =>
      input.reopenRequested
        ? write<Feedback>(`/api/reports/${reportId}/reopen-request`, json({ rating: input.rating, comment: input.comment }))
        : write<Feedback>(`/api/reports/${reportId}/feedback`, json({ rating: input.rating, comment: input.comment })),
  },

  ai: {
    async classify(_user, photoDataUrl) {
      const fd = new FormData()
      fd.set('photo', await dataUrlToBlob(photoDataUrl), 'photo.jpg')
      return http<AiClassifyResult>('/api/ai/classify-issue', { method: 'POST', body: fd }, 30_000)
    },
  },

  work: {
    list: (_user, filters) => http<ScopedReportRow[]>(`/api/reports${qs(filters)}`),
    async get(_user, id) {
      const b = await http<WorkBundle>(`/api/reports/${id}`)
      return { ...b, evidence: b.evidence.map(absolute) }
    },
    accept: (_user, id, note) => write<Report>(`/api/reports/${id}/accept`, json({ note })),
    assign: (_user, id, input) => write<Report>(`/api/reports/${id}/assign`, json(input)),
    updateStatus: (_user, id, input) => write<Report>(`/api/reports/${id}/status`, json(input)),
    updateSeverity: (_user, id, input) => write<Report>(`/api/reports/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    async addNote(_user, id, input) {
      await write(`/api/reports/${id}/notes`, json(input))
    },
    async addEvidence(_user, id, input) {
      const fd = new FormData()
      fd.set('type', input.type)
      fd.set('caption', input.caption)
      fd.set('photo', await dataUrlToBlob(input.dataUrl), 'evidence.jpg')
      return absolute(await write<Evidence>(`/api/reports/${id}/evidence`, { method: 'POST', body: fd }))
    },
    requestExtension: (_user, id, input) => write(`/api/reports/${id}/extension-requests`, json(input)),
  },

  supervisor: {
    extensions: (_user, status) => http<ExtensionRow[]>(`/api/supervisor/extensions${status ? `?status=${status}` : ''}`),
    async reviewExtension(_user, id, input) {
      await write(`/api/supervisor/extensions/${id}/review`, json(input))
    },
    escalations: () => http<EscalationRow[]>('/api/supervisor/escalations'),
    async reviewEscalation(_user, id, input) {
      await write(`/api/supervisor/escalations/${id}/review`, json(input))
    },
    disputes: () => http<DisputeRow[]>('/api/supervisor/disputes'),
    async decideReopen(_user, feedbackId, input) {
      await write(`/api/supervisor/disputes/${feedbackId}/decision`, json(input))
    },
    audit: (_user, filters) => http(`/api/supervisor/audit${qs(undefined, { reportId: filters?.reportId, entityType: filters?.entityType, limit: filters?.limit })}`),
  },

  analytics: {
    summary: (_user, filters) => http<SummaryStats>(`/api/analytics/summary${qs(filters)}`),
    departments: (_user, filters) => http<DepartmentStats[]>(`/api/analytics/departments${qs(filters)}`),
    trend: (_user, weeks = 10, filters) => http<TrendPoint[]>(`/api/analytics/trend${qs(filters, { weeks })}`),
    hotspots: (_user, filters) => http(`/api/analytics/hotspots${qs(filters)}`),
  },

  notifications: {
    list: () => http<AppNotification[]>('/api/notifications'),
    async markRead(_user, ids) {
      await write('/api/notifications/read', json(ids === 'all' ? { all: true } : { ids }))
    },
  },

  admin: {
    users: () => http('/api/admin/users'),
    createUser: (_user, input) => write('/api/admin/users', json(input)),
    updateUser: (_user, id, input) => write(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    accessRequests: (_user, status) => http(`/api/admin/access-requests${status ? `?status=${status}` : ''}`),
    decideAccess: (_user, id, input) => write(`/api/admin/access-requests/${id}/decision`, json(input)),
    myAccessRequest: () => http('/api/me/access-request'),
  },

  auth: {
    async registerDemoCitizen() {
      throw new ApiError(400, 'Use Supabase sign-up in API mode.')
    },
  },
}
