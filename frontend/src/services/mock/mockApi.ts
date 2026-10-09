/**
 * Mock implementation of the CivicApi contract (Phase 1 demo mode).
 *
 * Permission checks here mirror the rules the Phase 2 FastAPI backend will enforce, so the UI behaves
 * realistically — but they run in the browser and are NOT a security boundary.
 */
import { CATEGORY_DEPARTMENT, DEPARTMENTS, SLA_POLICIES, USERS, ZONES, getDepartment, getUser, getZone, nearestZone } from '@/data/directory'
import { computeDeadlines, formatPublicId, type DemoDatabase } from '@/data/seed'
import { CATEGORIES, getDeadlineInfo, isActive, ROLE_LABEL, SEVERITIES, STATUSES, STATUS_META, nextStatuses } from '@/lib/domain'
import { matchesFilters } from '@/lib/filters'
import { distanceMeters } from '@/lib/geo'
import type {
  AppNotification,
  Evidence,
  Hotspot,
  IssueCategory,
  PublicReport,
  Report,
  ReportStatus,
  Severity,
  TimelineEntry,
  UserProfile,
} from '@/types'
import { forbidden, invalid, notFound } from '../errors'
import type { CivicApi, DepartmentStats, ScopedReportRow, SummaryStats, TrendPoint } from '../types'
import { commit, getDb, newId } from './store'

const latency = () => new Promise<void>((r) => setTimeout(r, 120 + Math.random() * 180))
const nowIso = () => new Date().toISOString()

/* ---------------------------------------------------------------- scope & mapping */

export function canViewReport(user: UserProfile, r: Report): boolean {
  const inZone = user.zoneIds.length === 0 || (r.zoneId !== null && user.zoneIds.includes(r.zoneId))
  switch (user.role) {
    case 'citizen':
      return r.citizenId === user.id
    case 'staff': {
      const dept = r.departmentId ?? CATEGORY_DEPARTMENT[r.category]
      return dept === user.departmentId && inZone
    }
    case 'supervisor':
    case 'administrator':
      return inZone
  }
}

function canWork(user: UserProfile, r: Report): boolean {
  if (user.role === 'supervisor' || user.role === 'administrator') return canViewReport(user, r)
  // Staff may act on complaints assigned to them, or on unclaimed open complaints in their scope.
  return user.role === 'staff' && canViewReport(user, r) && (r.assignedStaffId === user.id || (r.status === 'open' && !r.assignedStaffId))
}

function toPublic(r: Report): PublicReport {
  return {
    id: r.id,
    publicId: r.publicId,
    category: r.category,
    description: r.description,
    latitude: r.latitude,
    longitude: r.longitude,
    address: r.address,
    landmark: r.landmark,
    severity: r.severity,
    status: r.status,
    departmentId: r.departmentId,
    zoneId: r.zoneId,
    reportedAt: r.reportedAt,
    updatedAt: r.updatedAt,
    deadlines: r.deadlines,
    acknowledgedAt: r.acknowledgedAt,
    actionStartedAt: r.actionStartedAt,
    resolvedAt: r.resolvedAt,
    resolutionSummary: r.resolutionSummary,
    isDemo: r.isDemo,
  }
}

function scoped(user: UserProfile | null, d: DemoDatabase): Report[] {
  return user && user.role !== 'citizen' ? d.reports.filter((r) => canViewReport(user, r)) : d.reports
}

function requireReport(d: DemoDatabase, id: string): Report {
  const r = d.reports.find((x) => x.id === id)
  if (!r) throw notFound('Complaint not found.')
  return r
}

function requireRole(user: UserProfile, ...roles: UserProfile['role'][]) {
  if (!roles.includes(user.role)) throw forbidden()
}

function actorLabel(userId: string, role: UserProfile['role'], publicView: boolean): string {
  if (userId === 'system') return 'Automated deadline check'
  if (publicView) return ROLE_LABEL[role]
  const u = getUser(userId)
  return u ? `${u.displayName} · ${ROLE_LABEL[u.role]}` : ROLE_LABEL[role]
}

type TimelineAudience = 'public' | 'citizen' | 'internal'

function buildTimeline(d: DemoDatabase, reportId: string, audience: TimelineAudience): TimelineEntry[] {
  const pub = audience !== 'internal'
  const entries: TimelineEntry[] = []
  for (const h of d.history.filter((x) => x.reportId === reportId)) {
    entries.push({
      id: h.id,
      kind: 'status',
      title: h.previousStatus ? `Status changed to ${STATUS_META[h.newStatus].label}` : 'Complaint submitted',
      detail: h.comment,
      actorLabel: actorLabel(h.changedBy, h.changedByRole, pub),
      createdAt: h.createdAt,
      status: h.newStatus,
    })
  }
  for (const n of d.notes.filter((x) => x.reportId === reportId && (audience === 'internal' || !x.internal))) {
    entries.push({ id: n.id, kind: 'note', title: n.internal ? 'Internal note' : 'Progress update', detail: n.body, actorLabel: actorLabel(n.authorId, n.authorRole, pub), createdAt: n.createdAt, internal: n.internal })
  }
  for (const e of d.evidence.filter((x) => x.reportId === reportId && x.type !== 'original')) {
    entries.push({ id: e.id, kind: 'evidence', title: `${e.type === 'resolution' ? 'Resolution' : e.type === 'progress' ? 'Progress' : 'Supporting'} photo added`, detail: e.caption, actorLabel: actorLabel(e.uploadedBy, e.uploadedByRole, pub), createdAt: e.createdAt })
  }
  if (audience !== 'public') {
    for (const f of d.feedback.filter((x) => x.reportId === reportId)) {
      entries.push({ id: f.id, kind: 'feedback', title: f.reopenRequested ? 'Reopen requested by citizen' : `Citizen feedback (${f.rating}/5)`, detail: f.comment + (f.reopenDecision && f.reopenDecision !== 'pending' ? ` — Reopen ${f.reopenDecision}: ${f.decisionReason ?? ''}` : ''), actorLabel: audience === 'internal' ? actorLabel(f.citizenId, 'citizen', false) : 'You', createdAt: f.createdAt })
    }
  }
  if (audience === 'internal') {
    for (const a of d.assignments.filter((x) => x.reportId === reportId)) {
      entries.push({ id: a.id, kind: 'assignment', title: `Assigned to ${getUser(a.assignedStaffId)?.displayName ?? getDepartment(a.departmentId)?.shortName ?? 'department'}`, detail: a.reason, actorLabel: actorLabel(a.assignedBy, getUser(a.assignedBy)?.role ?? 'supervisor', false), createdAt: a.assignedAt })
    }
    for (const x of d.extensions.filter((e) => e.reportId === reportId)) {
      entries.push({ id: x.id, kind: 'extension', title: `Deadline extension requested (${x.deadlineKind})`, detail: x.reason, actorLabel: actorLabel(x.requestedBy, 'staff', false), createdAt: x.createdAt })
      if (x.reviewedAt) entries.push({ id: `${x.id}-r`, kind: 'extension', title: `Extension ${x.status}`, detail: x.reviewReason ?? '', actorLabel: actorLabel(x.reviewedBy ?? '', 'supervisor', false), createdAt: x.reviewedAt })
    }
    for (const e of d.escalations.filter((x) => x.reportId === reportId)) {
      entries.push({ id: e.id, kind: 'escalation', title: `Level ${e.level} escalation`, detail: e.reason + (e.actionTaken ? ` Action: ${e.actionTaken}` : ''), actorLabel: 'Automated deadline check', createdAt: e.triggeredAt })
    }
  }
  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function toRow(d: DemoDatabase, r: Report): ScopedReportRow {
  return {
    ...r,
    departmentName: getDepartment(r.departmentId)?.shortName ?? null,
    assignedStaffName: getUser(r.assignedStaffId)?.displayName ?? null,
    zoneName: getZone(r.zoneId)?.name ?? null,
    pendingExtension: d.extensions.some((x) => x.reportId === r.id && x.status === 'pending'),
    openEscalations: d.escalations.filter((x) => x.reportId === r.id && (x.status === 'open' || x.status === 'under_review')).length,
  }
}

function audit(d: DemoDatabase, user: UserProfile, action: string, entityType: DemoDatabase['audit'][number]['entityType'], entityId: string, reportId: string | null, summary: string) {
  d.audit.push({ id: newId('aud'), actorId: user.id, actorRole: user.role, action, entityType, entityId, reportId, summary, createdAt: nowIso() })
}

function notify(d: DemoDatabase, userId: string, title: string, body: string, link: string | null) {
  const n: AppNotification = { id: newId('ntf'), userId, title, body, link, read: false, createdAt: nowIso(), channel: 'in_app' }
  d.notifications.push(n)
}

function changeStatus(d: DemoDatabase, user: UserProfile, r: Report, next: ReportStatus, comment: string) {
  const prev = r.status
  const at = nowIso()
  d.history.push({ id: newId('his'), reportId: r.id, previousStatus: prev, newStatus: next, changedBy: user.id, changedByRole: user.role, comment, createdAt: at })
  r.status = next
  r.updatedAt = at
  audit(d, user, 'report.status_changed', 'report', r.id, r.id, `${r.publicId}: ${prev} → ${next}`)
  notify(d, r.citizenId, `${r.publicId} is now ${STATUS_META[next].label.toLowerCase()}`, comment, `/citizen/reports/${r.id}`)
}

const minLen = (value: string, n: number, field: string, label: string) => {
  if (value.trim().length < n) throw invalid(`${label} must be at least ${n} characters.`, { [field]: `At least ${n} characters required.` })
}

/* ---------------------------------------------------------------- analytics helpers */

function summarize(reports: Report[], d: DemoDatabase): SummaryStats {
  const now = Date.now()
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ReportStatus, number>
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<IssueCategory, number>
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>
  let overdue = 0
  let approaching = 0
  let criticalActive = 0
  let resTotal = 0
  let resCount = 0
  let onTime = 0
  for (const r of reports) {
    byStatus[r.status]++
    byCategory[r.category]++
    bySeverity[r.severity]++
    const info = getDeadlineInfo(r, now)
    if (info.state === 'overdue') overdue++
    if (info.state === 'approaching') approaching++
    if (isActive(r.status) && r.severity === 'critical') criticalActive++
    if (r.status === 'resolved' && r.resolvedAt) {
      resTotal += new Date(r.resolvedAt).getTime() - new Date(r.reportedAt).getTime()
      resCount++
      if (info.state === 'met') onTime++
    }
  }
  const ids = new Set(reports.map((r) => r.id))
  return {
    total: reports.length,
    active: reports.filter((r) => isActive(r.status)).length,
    resolved: byStatus.resolved,
    rejected: byStatus.rejected,
    overdue,
    approaching,
    criticalActive,
    byStatus,
    byCategory,
    bySeverity,
    avgResolutionHours: resCount ? resTotal / resCount / 3_600_000 : null,
    resolvedOnTimeRate: resCount ? onTime / resCount : null,
    openEscalations: d.escalations.filter((e) => ids.has(e.reportId) && (e.status === 'open' || e.status === 'under_review')).length,
    pendingExtensions: d.extensions.filter((e) => ids.has(e.reportId) && e.status === 'pending').length,
    pendingDisputes: d.feedback.filter((f) => ids.has(f.reportId) && f.reopenDecision === 'pending').length,
  }
}

/** Greedy radius clustering of reports into recurring-problem hotspots. */
export function computeHotspots(reports: (Report | PublicReport)[], radiusM = 250, minCount = 3): Hotspot[] {
  const pool = [...reports]
  const used = new Set<string>()
  const result: Hotspot[] = []
  // Seed from the densest points first.
  const density = new Map(pool.map((r) => [r.id, pool.filter((o) => distanceMeters(r.latitude, r.longitude, o.latitude, o.longitude) <= radiusM).length]))
  pool.sort((a, b) => density.get(b.id)! - density.get(a.id)!)
  for (const r of pool) {
    if (used.has(r.id)) continue
    const members = pool.filter((o) => !used.has(o.id) && distanceMeters(r.latitude, r.longitude, o.latitude, o.longitude) <= radiusM)
    if (members.length < minCount) continue
    members.forEach((m) => used.add(m.id))
    const categories: Hotspot['categories'] = {}
    members.forEach((m) => (categories[m.category] = (categories[m.category] ?? 0) + 1))
    const lat = members.reduce((s, m) => s + m.latitude, 0) / members.length
    const lng = members.reduce((s, m) => s + m.longitude, 0) / members.length
    const top = Object.entries(categories).sort((a, b) => b[1] - a[1])[0][0] as IssueCategory
    result.push({
      id: `hs-${result.length + 1}`,
      latitude: lat,
      longitude: lng,
      count: members.length,
      activeCount: members.filter((m) => isActive(m.status)).length,
      categories,
      reportIds: members.map((m) => m.id),
      publicIds: members.map((m) => m.publicId),
      label: `${members[0].address.split(',').slice(1, 3).join(',').trim()} (${top})`,
    })
  }
  return result.sort((a, b) => b.count - a.count)
}

/* ---------------------------------------------------------------- implementation */

export const mockApi: CivicApi = {
  directory: {
    async departments() {
      return DEPARTMENTS
    },
    async zones() {
      return ZONES
    },
    async staff(departmentId) {
      return USERS.filter((u) => u.role === 'staff' && (!departmentId || u.departmentId === departmentId))
    },
    async slaPolicies() {
      return SLA_POLICIES
    },
  },

  publicReports: {
    async list(filters) {
      await latency()
      return getDb().reports.filter((r) => matchesFilters(r, filters)).map(toPublic)
    },
    async get(id) {
      await latency()
      const d = getDb()
      const r = requireReport(d, id)
      return {
        report: toPublic(r),
        timeline: buildTimeline(d, id, 'public'),
        evidence: d.evidence.filter((e) => e.reportId === id),
      }
    },
    async findByPublicId(publicId) {
      await latency()
      const r = getDb().reports.find((x) => x.publicId.toLowerCase() === publicId.trim().toLowerCase())
      return r ? toPublic(r) : null
    },
  },

  citizen: {
    async create(user, input) {
      await latency()
      requireRole(user, 'citizen')
      const errors: Record<string, string> = {}
      if (!CATEGORIES.includes(input.category)) errors.category = 'Choose a category.'
      if (input.description.trim().length < 20) errors.description = 'Describe the issue in at least 20 characters.'
      if (input.description.length > 1000) errors.description = 'Keep the description under 1000 characters.'
      if (!Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90 || !Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180) errors.location = 'Pick a valid location on the map.'
      if (!input.photoDataUrl.startsWith('data:image/')) errors.photo = 'Attach a photo of the issue.'
      if (Object.keys(errors).length) throw invalid('Please correct the highlighted fields.', errors)

      return commit((d) => {
        const at = Date.now()
        // Phase 1 default: severity starts as "medium"; staff/supervisors triage it. Phase 3 adds rule-based suggestions.
        const severity: Severity = 'medium'
        const deadlines = computeDeadlines(input.category, severity, at)
        const zone = nearestZone(input.latitude, input.longitude)
        const report: Report = {
          id: newId('rep'),
          publicId: formatPublicId(++d.counters.report),
          citizenId: user.id,
          category: input.category,
          description: input.description.trim(),
          latitude: Number(input.latitude.toFixed(6)),
          longitude: Number(input.longitude.toFixed(6)),
          address: input.address.trim() || 'Address not provided',
          landmark: input.landmark.trim(),
          severity,
          status: 'open',
          departmentId: null,
          zoneId: zone.id,
          assignedStaffId: null,
          reportedAt: new Date(at).toISOString(),
          updatedAt: new Date(at).toISOString(),
          deadlines,
          originalDeadlines: { ...deadlines },
          acknowledgedAt: null,
          actionStartedAt: null,
          resolvedAt: null,
          resolutionSummary: null,
          rejectionReason: null,
          aiSuggestedCategory: null,
          aiExplanation: null,
          isDemo: true,
        }
        d.reports.push(report)
        d.history.push({ id: newId('his'), reportId: report.id, previousStatus: null, newStatus: 'open', changedBy: user.id, changedByRole: 'citizen', comment: 'Complaint submitted by citizen.', createdAt: report.reportedAt })
        d.evidence.push({ id: newId('evi'), reportId: report.id, uploadedBy: user.id, uploadedByRole: 'citizen', url: input.photoDataUrl, type: 'original', caption: 'Photo submitted with the complaint', isPlaceholder: false, createdAt: report.reportedAt })
        audit(d, user, 'report.created', 'report', report.id, report.id, `${report.publicId} submitted`)
        notify(d, user.id, `${report.publicId} received`, 'Your complaint has been recorded in demo mode and is awaiting acknowledgement.', `/citizen/reports/${report.id}`)
        return report
      })
    },
    async mine(user) {
      await latency()
      return getDb()
        .reports.filter((r) => r.citizenId === user.id)
        .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
    },
    async get(user, id) {
      await latency()
      const d = getDb()
      const r = requireReport(d, id)
      if (r.citizenId !== user.id) throw forbidden('You can only open complaints you submitted.')
      return {
        report: r,
        timeline: buildTimeline(d, id, 'citizen'),
        evidence: d.evidence.filter((e) => e.reportId === id),
        feedback: d.feedback.filter((f) => f.reportId === id),
      }
    },
    async findDuplicates(_user, input) {
      await latency()
      const compatible: Record<IssueCategory, IssueCategory[]> = { garbage: ['garbage', 'other'], drainage: ['drainage', 'other'], pothole: ['pothole', 'other'], other: ['garbage', 'drainage', 'pothole', 'other'] }
      const since = Date.now() - 30 * 86_400_000
      const words = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
      const mine = words(input.description)
      return getDb()
        .reports.filter((r) => r.status !== 'rejected' && compatible[input.category].includes(r.category) && new Date(r.reportedAt).getTime() >= since)
        .map((r) => {
          const theirs = words(r.description)
          const shared = [...mine].filter((w) => theirs.has(w)).length
          const union = new Set([...mine, ...theirs]).size
          return { r, d: distanceMeters(input.latitude, input.longitude, r.latitude, r.longitude), sim: union ? Math.round((shared / union) * 100) / 100 : 0 }
        })
        .filter((x) => x.d <= 150)
        .sort((a, b) => a.d - b.d)
        .slice(0, 5)
        .map(({ r, d, sim }) => ({ id: r.id, publicId: r.publicId, category: r.category, status: r.status, distanceM: Math.round(d), reportedAt: r.reportedAt, description: r.description.slice(0, 200), textSimilarity: sim }))
    },
    async submitFeedback(user, reportId, input) {
      await latency()
      requireRole(user, 'citizen')
      const d0 = getDb()
      const r0 = requireReport(d0, reportId)
      if (r0.citizenId !== user.id) throw forbidden()
      if (r0.status !== 'resolved') throw invalid('Feedback can be given once the complaint is marked resolved.')
      if (input.rating < 1 || input.rating > 5) throw invalid('Choose a rating from 1 to 5.', { rating: 'Required' })
      if (input.reopenRequested) minLen(input.comment, 15, 'comment', 'Please explain why the issue is unresolved — your reason')
      if (d0.feedback.some((f) => f.reportId === reportId && f.reopenDecision === 'pending')) throw invalid('A reopen request is already awaiting supervisor review.')
      return commit((d) => {
        const f = {
          id: newId('fbk'),
          reportId,
          citizenId: user.id,
          rating: input.rating,
          comment: input.comment.trim(),
          reopenRequested: input.reopenRequested,
          reopenDecision: input.reopenRequested ? ('pending' as const) : null,
          decisionReason: null,
          decidedBy: null,
          createdAt: nowIso(),
        }
        d.feedback.push(f)
        audit(d, user, input.reopenRequested ? 'feedback.reopen_requested' : 'feedback.submitted', 'feedback', f.id, reportId, `${r0.publicId}: ${input.reopenRequested ? 'reopen requested' : `rated ${input.rating}/5`}`)
        if (input.reopenRequested) {
          for (const s of USERS.filter((u) => u.role === 'supervisor')) notify(d, s.id, `Disputed resolution: ${r0.publicId}`, input.comment.trim(), `/supervisor/reports/${reportId}`)
        }
        return f
      })
    },
  },

  ai: {
    async classify() {
      await latency()
      return { available: false, message: 'AI assistance unavailable in demo mode — please choose the category yourself.', suggestion: null }
    },
  },

  work: {
    async list(user, filters) {
      await latency()
      requireRole(user, 'staff', 'supervisor', 'administrator')
      const d = getDb()
      return scoped(user, d)
        .filter((r) => matchesFilters(r, filters))
        .map((r) => toRow(d, r))
    },
    async get(user, id) {
      await latency()
      requireRole(user, 'staff', 'supervisor', 'administrator')
      const d = getDb()
      const r = requireReport(d, id)
      if (!canViewReport(user, r)) throw forbidden('This complaint is outside your department or zone.')
      const by = <T extends { reportId: string }>(arr: T[]) => arr.filter((x) => x.reportId === id)
      return {
        report: r,
        history: by(d.history),
        evidence: by(d.evidence),
        notes: by(d.notes),
        feedback: by(d.feedback),
        assignments: by(d.assignments),
        extensions: by(d.extensions),
        escalations: by(d.escalations),
        timeline: buildTimeline(d, id, 'internal'),
      }
    },
    async accept(user, id, note) {
      await latency()
      requireRole(user, 'staff')
      const r0 = requireReport(getDb(), id)
      if (!canViewReport(user, r0)) throw forbidden()
      if (r0.status !== 'open') throw invalid('Only open complaints can be accepted.')
      return commit((d) => {
        const r = requireReport(d, id)
        r.departmentId = user.departmentId
        r.assignedStaffId = user.id
        r.acknowledgedAt = nowIso()
        d.assignments.push({ id: newId('asg'), reportId: id, departmentId: user.departmentId!, assignedStaffId: user.id, assignedBy: user.id, reason: note.trim() || 'Accepted by staff member.', assignedAt: nowIso(), unassignedAt: null })
        audit(d, user, 'assignment.accepted', 'assignment', id, id, `${r.publicId} accepted by ${user.displayName}`)
        changeStatus(d, user, r, 'assigned', note.trim() || 'Complaint acknowledged and accepted by the department.')
        return r
      })
    },
    async assign(user, id, input) {
      await latency()
      const d0 = getDb()
      const r0 = requireReport(d0, id)
      if (!canViewReport(user, r0)) throw forbidden()
      if (user.role === 'citizen') throw forbidden()
      if (user.role === 'staff' && input.departmentId !== user.departmentId) throw forbidden('Staff can only hand over within their own department. Ask a supervisor to move it to another department.')
      if (!isActive(r0.status)) throw invalid('Closed complaints cannot be reassigned.')
      minLen(input.reason, 10, 'reason', 'Assignment reason')
      const staff = input.staffId ? getUser(input.staffId) : null
      if (input.staffId && (!staff || staff.role !== 'staff' || staff.departmentId !== input.departmentId)) throw invalid('Selected staff member does not belong to that department.', { staffId: 'Invalid staff member' })
      if (staff && staff.zoneIds.length && r0.zoneId && !staff.zoneIds.includes(r0.zoneId)) throw invalid(`${staff.displayName} is not authorised for this zone.`, { staffId: 'Outside staff zone' })
      return commit((d) => {
        const r = requireReport(d, id)
        const at = nowIso()
        d.assignments.filter((a) => a.reportId === id && !a.unassignedAt).forEach((a) => (a.unassignedAt = at))
        d.assignments.push({ id: newId('asg'), reportId: id, departmentId: input.departmentId, assignedStaffId: input.staffId, assignedBy: user.id, reason: input.reason.trim(), assignedAt: at, unassignedAt: null })
        const wasOpen = r.status === 'open'
        r.departmentId = input.departmentId
        r.assignedStaffId = input.staffId
        r.updatedAt = at
        audit(d, user, wasOpen ? 'assignment.created' : 'assignment.reassigned', 'assignment', id, id, `${r.publicId} → ${getDepartment(input.departmentId)?.shortName}${staff ? ` / ${staff.displayName}` : ''}: ${input.reason.trim()}`)
        if (staff) notify(d, staff.id, `Assigned: ${r.publicId}`, input.reason.trim(), `/staff/reports/${r.id}`)
        if (wasOpen) {
          r.acknowledgedAt = at
          changeStatus(d, user, r, 'assigned', `Assigned to ${getDepartment(input.departmentId)?.shortName ?? 'department'}.`)
        }
        return r
      })
    },
    async updateStatus(user, id, input) {
      await latency()
      const d0 = getDb()
      const r0 = requireReport(d0, id)
      if (!canWork(user, r0)) throw forbidden('Only the assigned staff member or a supervisor can update this complaint.')
      if (input.newStatus === 'assigned' && r0.status === 'open') throw invalid('Use “Accept” or “Assign” to take on an open complaint.')
      if (!nextStatuses(r0.status).includes(input.newStatus)) throw invalid(`Cannot move from ${STATUS_META[r0.status].label} to ${STATUS_META[input.newStatus].label}.`)
      minLen(input.comment, 10, 'comment', 'Update comment')
      if (input.newStatus === 'resolved') {
        minLen(input.resolutionSummary ?? '', 20, 'resolutionSummary', 'Resolution summary')
        const hasResolutionPhoto = d0.evidence.some((e) => e.reportId === id && e.type === 'resolution')
        if (!hasResolutionPhoto) throw invalid('Upload at least one resolution photo before closing the complaint.', { evidence: 'Resolution photo required' })
      }
      if (input.newStatus === 'rejected') minLen(input.comment, 20, 'comment', 'Rejection reason')
      return commit((d) => {
        const r = requireReport(d, id)
        const at = nowIso()
        if (input.newStatus === 'in_progress') r.actionStartedAt = at
        if (input.newStatus === 'resolved') {
          r.resolvedAt = at
          r.resolutionSummary = input.resolutionSummary!.trim()
          if (!r.actionStartedAt) r.actionStartedAt = at
        }
        if (input.newStatus === 'rejected') {
          r.rejectionReason = input.comment.trim()
          if (!r.acknowledgedAt) r.acknowledgedAt = at
        }
        changeStatus(d, user, r, input.newStatus, input.comment.trim())
        return r
      })
    },
    async addNote(user, id, input) {
      await latency()
      const r0 = requireReport(getDb(), id)
      if (!canWork(user, r0)) throw forbidden('Only the assigned staff member or a supervisor can add notes.')
      minLen(input.body, 5, 'body', 'Note')
      commit((d) => {
        d.notes.push({ id: newId('not'), reportId: id, authorId: user.id, authorRole: user.role, body: input.body.trim(), internal: input.internal, createdAt: nowIso() })
        requireReport(d, id).updatedAt = nowIso()
        audit(d, user, input.internal ? 'note.internal_added' : 'note.public_added', 'report', id, id, `${r0.publicId}: ${input.internal ? 'internal' : 'public'} note added`)
        if (!input.internal) notify(d, r0.citizenId, `Update on ${r0.publicId}`, input.body.trim(), `/citizen/reports/${id}`)
      })
    },
    async addEvidence(user, id, input) {
      await latency()
      const r0 = requireReport(getDb(), id)
      if (!canWork(user, r0)) throw forbidden('Only the assigned staff member or a supervisor can upload evidence.')
      if (!input.dataUrl.startsWith('data:image/')) throw invalid('Attach an image file.', { photo: 'Image required' })
      if (input.type === 'original') throw invalid('Original photos come from the citizen report.')
      return commit((d) => {
        const e: Evidence = { id: newId('evi'), reportId: id, uploadedBy: user.id, uploadedByRole: user.role, url: input.dataUrl, type: input.type, caption: input.caption.trim() || `${input.type} photo`, isPlaceholder: false, createdAt: nowIso() }
        d.evidence.push(e)
        requireReport(d, id).updatedAt = nowIso()
        audit(d, user, 'evidence.uploaded', 'evidence', e.id, id, `${r0.publicId}: ${input.type} photo uploaded`)
        return e
      })
    },
    async updateSeverity(user, id, input) {
      await latency()
      const r0 = requireReport(getDb(), id)
      if (user.role === 'citizen' || !canWork(user, r0)) throw forbidden('Only the assigned staff member or a supervisor can triage severity.')
      if (!isActive(r0.status)) throw invalid('Severity can only be changed on active complaints.')
      minLen(input.reason, 10, 'reason', 'Reason')
      if (input.severity === r0.severity) throw invalid('Severity is already set to that value.')
      return commit((d) => {
        const r = requireReport(d, id)
        const old = r.severity
        r.severity = input.severity
        // Re-derive targets for stages not yet completed; completed stages and recorded breaches are untouched.
        const fresh = computeDeadlines(r.category, input.severity, new Date(r.reportedAt).getTime())
        if (r.status !== 'reopened') {
          if (!r.acknowledgedAt) r.deadlines.acknowledgement = fresh.acknowledgement
          if (!r.actionStartedAt) r.deadlines.action = fresh.action
          r.deadlines.resolution = fresh.resolution
        }
        r.updatedAt = nowIso()
        audit(d, user, 'report.severity_changed', 'report', r.id, r.id, `${r.publicId}: severity ${old} → ${input.severity} — ${input.reason.trim()}`)
        return r
      })
    },
    async requestExtension(user, id, input) {
      await latency()
      const d0 = getDb()
      const r0 = requireReport(d0, id)
      if (user.role !== 'staff' || !canWork(user, r0)) throw forbidden('Only the assigned staff member can request an extension.')
      if (!isActive(r0.status)) throw invalid('Extensions apply to active complaints only.')
      if (d0.extensions.some((x) => x.reportId === id && x.status === 'pending')) throw invalid('An extension request is already pending for this complaint.')
      minLen(input.reason, 20, 'reason', 'Extension reason')
      const requested = new Date(input.requestedDeadline)
      if (Number.isNaN(requested.getTime())) throw invalid('Choose a valid date.', { requestedDeadline: 'Invalid date' })
      if (requested <= new Date(r0.deadlines[input.deadlineKind])) throw invalid('Requested deadline must be later than the current one.', { requestedDeadline: 'Must be later than current deadline' })
      return commit((d) => {
        const x = { id: newId('ext'), reportId: id, deadlineKind: input.deadlineKind, currentDeadline: r0.deadlines[input.deadlineKind], requestedDeadline: requested.toISOString(), requestedBy: user.id, reason: input.reason.trim(), status: 'pending' as const, reviewedBy: null, reviewReason: null, createdAt: nowIso(), reviewedAt: null }
        d.extensions.push(x)
        audit(d, user, 'extension.requested', 'extension', x.id, id, `${r0.publicId}: ${input.deadlineKind} extension requested`)
        for (const s of USERS.filter((u) => u.role === 'supervisor')) notify(d, s.id, `Extension request: ${r0.publicId}`, input.reason.trim(), `/supervisor/reports/${id}`)
        return x
      })
    },
  },

  supervisor: {
    async extensions(user, status) {
      await latency()
      requireRole(user, 'supervisor', 'administrator')
      const d = getDb()
      return d.extensions
        .filter((x) => !status || x.status === status)
        .map((x) => ({ ...x, report: requireReport(d, x.reportId), requestedByName: getUser(x.requestedBy)?.displayName ?? 'Unknown' }))
        .filter((x) => canViewReport(user, x.report))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async reviewExtension(user, id, input) {
      await latency()
      requireRole(user, 'supervisor', 'administrator')
      minLen(input.reason, 10, 'reason', 'Decision reason')
      const x0 = getDb().extensions.find((x) => x.id === id)
      if (!x0) throw notFound()
      if (x0.status !== 'pending') throw invalid('This request has already been reviewed.')
      commit((d) => {
        const x = d.extensions.find((e) => e.id === id)!
        const r = requireReport(d, x.reportId)
        x.status = input.decision
        x.reviewedBy = user.id
        x.reviewReason = input.reason.trim()
        x.reviewedAt = nowIso()
        if (input.decision === 'approved') {
          // Earlier breaches stay recorded in escalation history; only the forward-looking target moves.
          r.deadlines = { ...r.deadlines, [x.deadlineKind]: x.requestedDeadline }
          r.updatedAt = nowIso()
        }
        audit(d, user, `extension.${input.decision}`, 'extension', x.id, r.id, `${r.publicId}: ${x.deadlineKind} extension ${input.decision} — ${input.reason.trim()}`)
        notify(d, x.requestedBy, `Extension ${input.decision}: ${r.publicId}`, input.reason.trim(), `/staff/reports/${r.id}`)
      })
    },
    async escalations(user) {
      await latency()
      requireRole(user, 'supervisor', 'administrator')
      const d = getDb()
      return d.escalations
        .map((e) => ({ ...e, report: requireReport(d, e.reportId) }))
        .filter((e) => canViewReport(user, e.report))
        .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))
    },
    async reviewEscalation(user, id, input) {
      await latency()
      requireRole(user, 'supervisor', 'administrator')
      minLen(input.actionTaken, 10, 'actionTaken', 'Action taken')
      const e0 = getDb().escalations.find((e) => e.id === id)
      if (!e0) throw notFound()
      if (e0.status === 'closed') throw invalid('This escalation is already closed.')
      commit((d) => {
        const e = d.escalations.find((x) => x.id === id)!
        e.status = input.status
        e.actionTaken = input.actionTaken.trim()
        e.reviewedBy = user.id
        e.reviewedAt = nowIso()
        const r = requireReport(d, e.reportId)
        audit(d, user, 'escalation.reviewed', 'escalation', e.id, r.id, `${r.publicId}: escalation marked ${input.status.replace('_', ' ')} — ${input.actionTaken.trim()}`)
      })
    },
    async disputes(user) {
      await latency()
      requireRole(user, 'supervisor', 'administrator')
      const d = getDb()
      return d.feedback
        .filter((f) => f.reopenRequested)
        .map((f) => ({ ...f, report: requireReport(d, f.reportId) }))
        .filter((f) => canViewReport(user, f.report))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async decideReopen(user, feedbackId, input) {
      await latency()
      requireRole(user, 'supervisor', 'administrator')
      minLen(input.reason, 10, 'reason', 'Decision reason')
      const f0 = getDb().feedback.find((f) => f.id === feedbackId)
      if (!f0) throw notFound()
      if (f0.reopenDecision !== 'pending') throw invalid('This dispute has already been decided.')
      commit((d) => {
        const f = d.feedback.find((x) => x.id === feedbackId)!
        const r = requireReport(d, f.reportId)
        f.reopenDecision = input.decision
        f.decisionReason = input.reason.trim()
        f.decidedBy = user.id
        audit(d, user, `dispute.${input.decision}`, 'feedback', f.id, r.id, `${r.publicId}: reopen ${input.decision} — ${input.reason.trim()}`)
        if (input.decision === 'approved' && r.status === 'resolved') {
          const fresh = computeDeadlines(r.category, r.severity, Date.now())
          r.deadlines = { ...r.deadlines, action: fresh.action, resolution: fresh.resolution }
          r.actionStartedAt = null
          r.resolvedAt = null
          changeStatus(d, user, r, 'reopened', `Reopened after review: ${input.reason.trim()}`)
          if (r.assignedStaffId) notify(d, r.assignedStaffId, `Reopened: ${r.publicId}`, input.reason.trim(), `/staff/reports/${r.id}`)
        } else {
          notify(d, r.citizenId, `Reopen request reviewed: ${r.publicId}`, `Decision: ${input.decision}. ${input.reason.trim()}`, `/citizen/reports/${r.id}`)
        }
      })
    },
    async audit(user, filters) {
      await latency()
      requireRole(user, 'supervisor', 'administrator')
      const d = getDb()
      const visible = new Set(scoped(user, d).map((r) => r.id))
      return d.audit
        .filter((a) => !a.reportId || visible.has(a.reportId))
        .filter((a) => !filters?.reportId || a.reportId === filters.reportId)
        .filter((a) => !filters?.actorId || a.actorId === filters.actorId)
        .filter((a) => !filters?.entityType || a.entityType === filters.entityType)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, filters?.limit ?? 500)
    },
  },

  analytics: {
    async summary(user, filters) {
      await latency()
      const d = getDb()
      const base = user?.role === 'citizen' ? d.reports.filter((r) => r.citizenId === user.id) : scoped(user, d)
      return summarize(base.filter((r) => matchesFilters(r, filters)), d)
    },
    async departments(user, filters) {
      await latency()
      requireRole(user, 'staff', 'supervisor', 'administrator')
      const d = getDb()
      const base = scoped(user, d).filter((r) => matchesFilters(r, filters))
      return DEPARTMENTS.map((dep): DepartmentStats => {
        const rs = base.filter((r) => (r.departmentId ?? CATEGORY_DEPARTMENT[r.category]) === dep.id)
        const s = summarize(rs, d)
        return { departmentId: dep.id, name: dep.shortName, total: s.total, active: s.active, resolved: s.resolved, overdue: s.overdue, critical: s.criticalActive, avgResolutionHours: s.avgResolutionHours, onTimeRate: s.resolvedOnTimeRate }
      })
    },
    async trend(user, weeks = 10, filters) {
      await latency()
      const d = getDb()
      const base = scoped(user, d).filter((r) => matchesFilters(r, filters))
      const WEEK = 7 * 86_400_000
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      start.setDate(start.getDate() - start.getDay())
      const points: TrendPoint[] = []
      for (let i = weeks - 1; i >= 0; i--) {
        const from = start.getTime() - i * WEEK
        const to = from + WEEK
        const within = (iso: string | null) => !!iso && new Date(iso).getTime() >= from && new Date(iso).getTime() < to
        points.push({ weekStart: new Date(from).toISOString(), reported: base.filter((r) => within(r.reportedAt)).length, resolved: base.filter((r) => within(r.resolvedAt)).length })
      }
      return points
    },
    async hotspots(user, filters) {
      await latency()
      const d = getDb()
      return computeHotspots(scoped(user, d).filter((r) => matchesFilters(r, filters)))
    },
  },

  notifications: {
    async list(user) {
      return getDb()
        .notifications.filter((n) => n.userId === user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50)
    },
    async markRead(user, ids) {
      commit((d) => {
        d.notifications.filter((n) => n.userId === user.id && (ids === 'all' || ids.includes(n.id))).forEach((n) => (n.read = true))
      })
    },
  },

  auth: {
    async registerDemoCitizen(input) {
      await latency()
      const name = input.displayName.trim()
      const email = input.email.trim().toLowerCase()
      if (name.length < 2) throw invalid('Enter your name.', { displayName: 'Required' })
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid('Enter a valid email address.', { email: 'Invalid email' })
      if (USERS.some((u) => u.email?.toLowerCase() === email)) throw invalid('That email is already used by a demo account.', { email: 'Already registered' })
      return commit((d) => {
        // Self-registration always yields a citizen. Elevated roles are provisioned server-side only (Phase 2).
        const user: UserProfile = { id: newId('usr-cit'), displayName: name, role: 'citizen', departmentId: null, zoneIds: [], email, isDemo: true }
        d.registeredUsers.push(user)
        USERS.push(user)
        audit(d, user, 'profile.registered', 'profile', user.id, null, `Demo citizen account created`)
        return user
      })
    },
  },
}
