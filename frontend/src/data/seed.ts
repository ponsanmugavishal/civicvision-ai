/**
 * DEMO SEED DATA GENERATOR
 * Produces clearly-labelled sample complaints around the configured map centre.
 * Locations, addresses, people and evidence are fictional; photos are generated
 * placeholder illustrations, not real photographs. Nothing here reflects real
 * government assignments, real-world resolutions or AI predictions.
 */
import type {
  Assignment,
  AuditLogEntry,
  AppNotification,
  DeadlineExtensionRequest,
  Deadlines,
  EscalationEvent,
  Evidence,
  Feedback,
  IssueCategory,
  ProgressNote,
  Report,
  ReportStatus,
  Severity,
  StatusHistoryEntry,
  UserProfile,
} from '@/types'
import { CATEGORY_DEPARTMENT, findSla, USERS, ZONES } from './directory'

export interface DemoDatabase {
  version: number
  seededAt: string
  reports: Report[]
  history: StatusHistoryEntry[]
  notes: ProgressNote[]
  evidence: Evidence[]
  assignments: Assignment[]
  extensions: DeadlineExtensionRequest[]
  escalations: EscalationEvent[]
  feedback: Feedback[]
  audit: AuditLogEntry[]
  notifications: AppNotification[]
  /** Demo citizens created through the register form (browser-only). */
  registeredUsers: UserProfile[]
  counters: { report: number; id: number }
}

export const DEMO_DB_VERSION = 5

const HOUR = 3_600_000
const DAY = 24 * HOUR

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function computeDeadlines(category: IssueCategory, severity: Severity, reportedAtMs: number): Deadlines {
  const sla = findSla(category, severity)
  return {
    acknowledgement: new Date(reportedAtMs + sla.acknowledgementHours * HOUR).toISOString(),
    action: new Date(reportedAtMs + sla.actionHours * HOUR).toISOString(),
    resolution: new Date(reportedAtMs + sla.resolutionHours * HOUR).toISOString(),
  }
}

export function formatPublicId(n: number, year = new Date().getFullYear()): string {
  return `CV-${year}-${String(n).padStart(5, '0')}`
}

const DESCRIPTIONS: Record<IssueCategory, string[]> = {
  garbage: [
    'Garbage has been piling up next to the community bin for several days and is spilling onto the footpath.',
    'Construction debris and household waste dumped on the vacant plot; stray animals are scattering it.',
    'Overflowing bin near the market entrance. Strong smell and flies in the area.',
    'Plastic waste and food waste dumped along the canal bank, blocking part of the lane.',
    'Waste collection has been missed this week; bags left on the road corner.',
    'Burnt garbage heap with smoke in the early morning near the bus stop.',
  ],
  drainage: [
    'Drain is completely blocked with silt and plastic; water overflows onto the road after light rain.',
    'Sewage overflow from the manhole near the junction; pedestrians are walking through dirty water.',
    'Knee-deep waterlogging after the evening rain â€” two-wheelers are stalling here.',
    'Broken drain slab leaves an open gap at the edge of the footpath; risk of someone falling in.',
    'Standing water for three days next to the school gate, mosquitoes breeding.',
    'Storm drain inlet covered by debris; water is pooling at the low point of the road.',
  ],
  pothole: [
    'Large pothole in the middle of the lane, roughly half a metre wide. Vehicles swerve suddenly to avoid it.',
    'Series of potholes after the recent cable trench work; road surface not restored.',
    'Deep pothole filled with rainwater, hard to see at night. A cyclist fell here yesterday.',
    'Road edge has crumbled near the culvert, narrowing the carriageway.',
    'Speed breaker damaged and broken pieces of asphalt lying on the road.',
    'Uneven patchwork repair has sunk again, creating a sharp drop near the signal.',
  ],
  other: [
    'Fallen tree branch partly blocking the footpath after the storm.',
    'Streetlight-pole base damaged and leaning slightly toward the road.',
    'Open digging left unbarricaded near the park entrance.',
  ],
}

const STREETS = ['Market Street', 'Lake View Road', 'Temple Lane', 'Station Road', 'School Road', 'Canal Bank Road', '1st Main Road', '2nd Cross Street', 'Park Avenue', 'Hospital Road', 'Bazaar Lane', 'Riverside Drive']
const LANDMARKS = ['Opposite the bus stop', 'Near the community hall', 'Beside the primary school gate', 'Next to the vegetable market', 'Close to the public library', 'Behind the playground', 'At the junction with the main road', 'Near the water tank', 'Outside the clinic', 'Near the metro pillar']

const REJECTION_REASONS = [
  'Location is inside a private compound; outside municipal maintenance scope. Citizen advised accordingly.',
  'Duplicate of an existing complaint at the same spot; tracking continues on the original report.',
  'Site inspected â€” issue not found at the reported location. Citizen may submit a new report with a clearer photo.',
]

const RESOLUTION_SUMMARIES: Record<IssueCategory, string[]> = {
  garbage: ['Waste cleared and area sanitised; collection frequency for this point increased to daily.', 'Dumped debris removed with loader; warning signboard installed.'],
  drainage: ['Drain desilted over 40 m stretch; outlet cleared and slab replaced.', 'Manhole cleared and sewer line flushed; overflow stopped.'],
  pothole: ['Pothole cut, cleaned and patched with hot-mix asphalt; surface levelled.', 'Road edge rebuilt and resurfaced across 12 m.'],
  other: ['Obstruction removed and site barricaded until permanent repair.', 'Issue routed to the responsible unit and closed after site visit.'],
}

/** Clusters of nearby reports so that recurring-problem hotspots exist in the demo. */
const HOTSPOT_SEEDS: { zone: string; dLat: number; dLng: number; category: IssueCategory; count: number }[] = [
  { zone: 'zone-c', dLat: 0.004, dLng: -0.003, category: 'garbage', count: 6 },
  { zone: 'zone-n', dLat: -0.003, dLng: 0.005, category: 'drainage', count: 5 },
  { zone: 'zone-s', dLat: 0.002, dLng: 0.004, category: 'pothole', count: 5 },
  { zone: 'zone-w', dLat: -0.004, dLng: -0.002, category: 'garbage', count: 4 },
]

export function createSeedDatabase(now = Date.now()): DemoDatabase {
  const rand = mulberry32(20261009)
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]
  const weighted = <T,>(entries: [T, number][]): T => {
    const total = entries.reduce((s, [, w]) => s + w, 0)
    let r = rand() * total
    for (const [v, w] of entries) {
      if ((r -= w) <= 0) return v
    }
    return entries[entries.length - 1][0]
  }

  const db: DemoDatabase = {
    version: DEMO_DB_VERSION,
    seededAt: new Date(now).toISOString(),
    reports: [],
    history: [],
    notes: [],
    evidence: [],
    assignments: [],
    extensions: [],
    escalations: [],
    feedback: [],
    audit: [],
    notifications: [],
    registeredUsers: [],
    counters: { report: 0, id: 0 },
  }
  const nextId = (prefix: string) => `${prefix}-${String(++db.counters.id).padStart(5, '0')}`
  const iso = (ms: number) => new Date(Math.min(ms, now)).toISOString()

  const citizens = USERS.filter((u) => u.role === 'citizen')
  const staffFor = (deptId: string, zoneId: string) =>
    USERS.filter((u) => u.role === 'staff' && u.departmentId === deptId && (u.zoneIds.length === 0 || u.zoneIds.includes(zoneId)))
  const supervisor = USERS.find((u) => u.role === 'supervisor')!

  type Plan = { category: IssueCategory; zone: string; lat: number; lng: number }
  const plans: Plan[] = []

  for (const h of HOTSPOT_SEEDS) {
    const z = ZONES.find((zz) => zz.id === h.zone)!
    for (let i = 0; i < h.count; i++) {
      plans.push({
        category: i === h.count - 1 && rand() < 0.5 ? pick(['garbage', 'drainage', 'pothole'] as IssueCategory[]) : h.category,
        zone: h.zone,
        lat: z.center[0] + h.dLat + (rand() - 0.5) * 0.0018,
        lng: z.center[1] + h.dLng + (rand() - 0.5) * 0.0018,
      })
    }
  }
  while (plans.length < 76) {
    const z = pick(ZONES)
    plans.push({
      category: weighted<IssueCategory>([['garbage', 34], ['drainage', 28], ['pothole', 32], ['other', 6]]),
      zone: z.id,
      lat: z.center[0] + (rand() - 0.5) * 0.026,
      lng: z.center[1] + (rand() - 0.5) * 0.026,
    })
  }

  // Interleave so IDs aren't grouped by hotspot.
  plans.sort(() => rand() - 0.5)

  type Target = 'on_track' | 'approaching' | 'overdue'
  type Draft = {
    plan: Plan
    severity: Severity
    status: ReportStatus
    late: boolean
    reportedAt: number
    /** Hours from report â†’ acknowledgement, acknowledgement â†’ action start, action start â†’ resolution. */
    ackDur: number
    actDur: number
    resDur: number
    /** Reopened only: hours before now that the complaint was reopened. */
    reopenAgo: number
  }

  // Where "now" falls inside the active stage's target window, as a fraction of that window.
  const fractionFor = (t: Target) => (t === 'on_track' ? 0.1 + rand() * 0.55 : t === 'approaching' ? 0.8 + rand() * 0.15 : 1.15 + rand() * 1.6)

  const drafts: Draft[] = plans.map((plan) => {
    const severity = weighted<Severity>([['critical', 12], ['high', 26], ['medium', 40], ['low', 22]])
    const status = weighted<ReportStatus>([['open', 12], ['assigned', 12], ['in_progress', 18], ['resolved', 42], ['rejected', 6], ['reopened', 6]])
    const target = weighted<Target>([['on_track', 50], ['approaching', 22], ['overdue', 28]])
    const late = status === 'resolved' || status === 'rejected' ? rand() < 0.3 : target === 'overdue'
    const sla = findSla(plan.category, severity)
    const f = (lo: number, hi: number) => lo + rand() * (hi - lo)
    let ackDur = sla.acknowledgementHours * (late ? f(1.2, 1.9) : f(0.15, 0.85))
    let actDur = (sla.actionHours - sla.acknowledgementHours) * (late ? f(1.1, 1.7) : f(0.2, 0.8))
    const resDur = (sla.resolutionHours - sla.actionHours) * (late ? f(1.05, 1.5) : f(0.2, 0.8))
    let ageH: number
    let reopenAgo = 0
    switch (status) {
      case 'open':
        ageH = sla.acknowledgementHours * fractionFor(target)
        break
      case 'assigned':
        ageH = sla.actionHours * fractionFor(target)
        ackDur = Math.min(ackDur, ageH * 0.6)
        break
      case 'in_progress':
        ageH = sla.resolutionHours * fractionFor(target)
        if (ackDur + actDur > ageH * 0.8) {
          const k = (ageH * 0.8) / (ackDur + actDur)
          ackDur *= k
          actDur *= k
        }
        break
      case 'reopened':
        reopenAgo = f(6, 40)
        ageH = ackDur + actDur + resDur + 26 + reopenAgo + f(24, 400)
        break
      default:
        ageH = ackDur + actDur + resDur + f(4, 1200)
    }
    return { plan, severity, status, late, reportedAt: now - ageH * HOUR, ackDur, actDur, resDur, reopenAgo }
  })
  drafts.sort((a, b) => a.reportedAt - b.reportedAt)

  let resolvedSeen = 0
  for (const d of drafts) {
    const { plan, severity, status } = d
    const reportedAt = d.reportedAt
    const deadlines = computeDeadlines(plan.category, severity, reportedAt)
    const citizen = pick(citizens)
    const deptId = CATEGORY_DEPARTMENT[plan.category]
    const staffPool = staffFor(deptId, plan.zone)
    const staff = staffPool.length ? pick(staffPool) : undefined
    const id = nextId('rep')
    const publicId = formatPublicId(++db.counters.report, new Date(reportedAt).getFullYear())

    const report: Report = {
      id,
      publicId,
      citizenId: citizen.id,
      category: plan.category,
      description: pick(DESCRIPTIONS[plan.category]),
      latitude: Number(plan.lat.toFixed(6)),
      longitude: Number(plan.lng.toFixed(6)),
      address: `${Math.floor(rand() * 180) + 1}, ${pick(STREETS)}, ${ZONES.find((z) => z.id === plan.zone)!.name.replace(' Zone', '')} Sector ${Math.floor(rand() * 9) + 1}`,
      landmark: pick(LANDMARKS),
      severity,
      status: 'open',
      departmentId: null,
      zoneId: plan.zone,
      assignedStaffId: null,
      reportedAt: iso(reportedAt),
      updatedAt: iso(reportedAt),
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
    db.reports.push(report)

    const pushHistory = (prev: ReportStatus | null, next: ReportStatus, by: UserProfile, at: number, comment: string) => {
      db.history.push({ id: nextId('his'), reportId: id, previousStatus: prev, newStatus: next, changedBy: by.id, changedByRole: by.role, comment, createdAt: iso(at) })
      db.audit.push({ id: nextId('aud'), actorId: by.id, actorRole: by.role, action: prev ? 'report.status_changed' : 'report.created', entityType: 'report', entityId: id, reportId: id, summary: prev ? `${publicId}: ${prev} â†’ ${next}` : `${publicId} submitted`, createdAt: iso(at) })
      report.status = next
      report.updatedAt = iso(at)
    }

    pushHistory(null, 'open', citizen, reportedAt, 'Complaint submitted by citizen.')
    db.evidence.push({ id: nextId('evi'), reportId: id, uploadedBy: citizen.id, uploadedByRole: 'citizen', url: `placeholder:${plan.category}:original`, type: 'original', caption: 'Photo submitted with the complaint (demo placeholder)', isPlaceholder: true, createdAt: iso(reportedAt) })

    if (status === 'open' || !staff) continue

    // Acknowledge + assign
    const ackAt = reportedAt + d.ackDur * HOUR
    report.departmentId = deptId
    report.assignedStaffId = staff.id
    report.acknowledgedAt = iso(ackAt)
    db.assignments.push({ id: nextId('asg'), reportId: id, departmentId: deptId, assignedStaffId: staff.id, assignedBy: supervisor.id, reason: 'Routed by category and zone (demo rule).', assignedAt: iso(ackAt), unassignedAt: null })
    db.audit.push({ id: nextId('aud'), actorId: supervisor.id, actorRole: 'supervisor', action: 'assignment.created', entityType: 'assignment', entityId: id, reportId: id, summary: `${publicId} assigned to ${staff.displayName}`, createdAt: iso(ackAt) })

    if (status === 'rejected') {
      const reason = pick(REJECTION_REASONS)
      report.rejectionReason = reason
      pushHistory('open', 'rejected', staff, ackAt + 2 * HOUR, reason)
      continue
    }

    pushHistory('open', 'assigned', staff, ackAt, `Acknowledged and assigned to ${staff.displayName}.`)
    if (status === 'assigned') continue

    const actionAt = ackAt + d.actDur * HOUR
    report.actionStartedAt = iso(actionAt)
    pushHistory('assigned', 'in_progress', staff, actionAt, 'Field team visited the site and started work.')
    db.notes.push({ id: nextId('not'), reportId: id, authorId: staff.id, authorRole: 'staff', body: 'Crew and equipment requested for this location.', internal: true, createdAt: iso(actionAt + 0.5 * HOUR) })
    db.notes.push({ id: nextId('not'), reportId: id, authorId: staff.id, authorRole: 'staff', body: 'Work started on site. Temporary barricade placed for safety.', internal: false, createdAt: iso(actionAt + HOUR) })
    if (rand() < 0.6) {
      db.evidence.push({ id: nextId('evi'), reportId: id, uploadedBy: staff.id, uploadedByRole: 'staff', url: `placeholder:${plan.category}:progress`, type: 'progress', caption: 'Work in progress (demo placeholder)', isPlaceholder: true, createdAt: iso(actionAt + 1.5 * HOUR) })
    }

    if (status === 'in_progress') {
      if (d.late && rand() < 0.6) {
        const requested = new Date(deadlines.resolution).getTime() + 3 * DAY
        db.extensions.push({ id: nextId('ext'), reportId: id, deadlineKind: 'resolution', currentDeadline: deadlines.resolution, requestedDeadline: new Date(requested).toISOString(), requestedBy: staff.id, reason: 'Material procurement pending; heavy machinery required for this repair.', status: 'pending', reviewedBy: null, reviewReason: null, createdAt: iso(actionAt + 2 * HOUR), reviewedAt: null })
      }
      continue
    }

    const resolvedAt = actionAt + d.resDur * HOUR
    const summary = pick(RESOLUTION_SUMMARIES[plan.category])
    report.resolvedAt = iso(resolvedAt)
    report.resolutionSummary = summary
    pushHistory('in_progress', 'resolved', staff, resolvedAt, summary)
    db.evidence.push({ id: nextId('evi'), reportId: id, uploadedBy: staff.id, uploadedByRole: 'staff', url: `placeholder:${plan.category}:resolution`, type: 'resolution', caption: 'After resolution (demo placeholder)', isPlaceholder: true, createdAt: iso(resolvedAt) })

    if (status === 'resolved') {
      resolvedSeen++
      if (resolvedSeen % 8 === 4) {
        // Every eighth resolved complaint carries a pending dispute for the supervisor's review queue.
        db.feedback.push({ id: nextId('fbk'), reportId: id, citizenId: citizen.id, rating: 1, comment: 'The problem is back within two days. Only the surface was cleaned.', reopenRequested: true, reopenDecision: 'pending', decisionReason: null, decidedBy: null, createdAt: iso(Math.min(resolvedAt + 30 * HOUR, now - HOUR)) })
      } else if (rand() < 0.55) {
        const rating = d.late ? 2 + Math.floor(rand() * 2) : 4 + Math.floor(rand() * 2)
        db.feedback.push({ id: nextId('fbk'), reportId: id, citizenId: citizen.id, rating, comment: rating >= 4 ? 'Cleared properly, thank you.' : 'Took longer than expected but it is done now.', reopenRequested: false, reopenDecision: null, decisionReason: null, decidedBy: null, createdAt: iso(Math.min(resolvedAt + 10 * HOUR, now - HOUR)) })
      }
      continue
    }

    // Reopened: citizen disputed, supervisor approved, new action/resolution targets from reopen time.
    const reopenAt = now - d.reopenAgo * HOUR
    const disputeAt = reopenAt - 6 * HOUR
    db.feedback.push({ id: nextId('fbk'), reportId: id, citizenId: citizen.id, rating: 1, comment: 'Issue has returned at the same spot.', reopenRequested: true, reopenDecision: 'approved', decisionReason: 'Photo evidence from the citizen confirms recurrence.', decidedBy: supervisor.id, createdAt: iso(disputeAt) })
    const newDeadlines = computeDeadlines(plan.category, severity, reopenAt)
    report.deadlines = { acknowledgement: report.deadlines.acknowledgement, action: newDeadlines.action, resolution: newDeadlines.resolution }
    report.actionStartedAt = null
    report.resolvedAt = null
    pushHistory('resolved', 'reopened', supervisor, reopenAt, 'Reopened after citizen dispute was upheld.')
  }

  return db
}
