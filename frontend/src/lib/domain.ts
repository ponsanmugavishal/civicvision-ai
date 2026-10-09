import type {
  DeadlineKind,
  DeadlineState,
  IssueCategory,
  PublicReport,
  Report,
  ReportStatus,
  Role,
  Severity,
} from '@/types'

export const CATEGORIES: IssueCategory[] = ['garbage', 'drainage', 'pothole', 'other']
export const STATUSES: ReportStatus[] = ['open', 'assigned', 'in_progress', 'resolved', 'rejected', 'reopened']
export const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low']
export const ACTIVE_STATUSES: ReportStatus[] = ['open', 'assigned', 'in_progress', 'reopened']

export const CATEGORY_META: Record<IssueCategory, { label: string; short: string; description: string; color: string }> = {
  garbage: {
    label: 'Garbage & waste dumping',
    short: 'Garbage',
    description: 'Overflowing bins, illegal dumping and uncollected waste.',
    color: '#0f766e',
  },
  drainage: {
    label: 'Drainage & waterlogging',
    short: 'Drainage',
    description: 'Blocked drains, overflow and standing water on streets.',
    color: '#0369a1',
  },
  pothole: {
    label: 'Potholes & damaged roads',
    short: 'Pothole',
    description: 'Potholes, broken surfaces and unsafe road edges.',
    color: '#92400e',
  },
  other: {
    label: 'Other civic issue',
    short: 'Other',
    description: 'Related civic problems that do not fit the three main categories.',
    color: '#475467',
  },
}

export const STATUS_META: Record<ReportStatus, { label: string; tone: Tone; description: string }> = {
  open: { label: 'Open', tone: 'slate', description: 'Submitted and awaiting acknowledgement.' },
  assigned: { label: 'Assigned', tone: 'blue', description: 'Acknowledged and assigned to a department.' },
  in_progress: { label: 'In progress', tone: 'indigo', description: 'Work has started on site.' },
  resolved: { label: 'Resolved', tone: 'green', description: 'Marked resolved with resolution evidence.' },
  rejected: { label: 'Rejected', tone: 'gray', description: 'Closed without action, with a stated reason.' },
  reopened: { label: 'Reopened', tone: 'amber', description: 'Reopened after a resolution was disputed.' },
}

export const SEVERITY_META: Record<Severity, { label: string; color: string; rank: number }> = {
  critical: { label: 'Critical', color: '#b42318', rank: 4 },
  high: { label: 'High', color: '#6941c6', rank: 3 },
  medium: { label: 'Medium', color: '#1d4ed8', rank: 2 },
  low: { label: 'Low', color: '#667085', rank: 1 },
}

export const DEADLINE_META: Record<DeadlineState, { label: string; tone: Tone }> = {
  on_track: { label: 'On track', tone: 'slate' },
  approaching: { label: 'Due soon', tone: 'orange' },
  overdue: { label: 'Overdue', tone: 'red' },
  met: { label: 'Met target', tone: 'green' },
  missed: { label: 'Resolved late', tone: 'gray' },
  not_applicable: { label: 'No deadline', tone: 'gray' },
}

export const DEADLINE_KIND_LABEL: Record<DeadlineKind, string> = {
  acknowledgement: 'Acknowledgement',
  action: 'Initial action',
  resolution: 'Resolution',
}

export const ROLE_LABEL: Record<Role, string> = {
  citizen: 'Citizen',
  staff: 'Department staff',
  supervisor: 'Supervisor',
  administrator: 'Administrator',
}

export type Tone = 'slate' | 'gray' | 'blue' | 'indigo' | 'green' | 'amber' | 'orange' | 'red' | 'violet' | 'teal'

export function isActive(status: ReportStatus): boolean {
  return ACTIVE_STATUSES.includes(status)
}

export interface DeadlineInfo {
  state: DeadlineState
  kind: DeadlineKind | null
  dueAt: string | null
  /** Positive = time left, negative = overdue by. */
  msRemaining: number | null
}

type DeadlineSubject = Pick<
  Report | PublicReport,
  'status' | 'deadlines' | 'reportedAt' | 'resolvedAt' | 'acknowledgedAt' | 'actionStartedAt'
>

/** Fraction of the target window remaining below which a deadline counts as "due soon". */
const APPROACHING_FRACTION = 0.25

/**
 * Computes the deadline state for a report. Deadline state is deliberately independent of severity.
 * Active reports track the earliest unmet stage (acknowledgement → action → resolution);
 * any unmet stage whose deadline has passed makes the report overdue.
 */
export function getDeadlineInfo(r: DeadlineSubject, now = Date.now()): DeadlineInfo {
  if (r.status === 'rejected') return { state: 'not_applicable', kind: null, dueAt: null, msRemaining: null }

  if (r.status === 'resolved') {
    const resolvedAt = r.resolvedAt ? new Date(r.resolvedAt).getTime() : now
    const due = new Date(r.deadlines.resolution).getTime()
    return {
      state: resolvedAt <= due ? 'met' : 'missed',
      kind: 'resolution',
      dueAt: r.deadlines.resolution,
      msRemaining: due - resolvedAt,
    }
  }

  const unmet: DeadlineKind[] = []
  if (!r.acknowledgedAt) unmet.push('acknowledgement')
  if (!r.actionStartedAt) unmet.push('action')
  unmet.push('resolution')

  const missed = unmet.filter((k) => new Date(r.deadlines[k]).getTime() < now)
  if (missed.length) {
    // Report the most advanced missed stage — it reflects the longest commitment that has lapsed.
    const kind = missed[missed.length - 1]
    const due = new Date(r.deadlines[kind]).getTime()
    return { state: 'overdue', kind, dueAt: r.deadlines[kind], msRemaining: due - now }
  }

  const kind = unmet[0]
  const due = new Date(r.deadlines[kind]).getTime()
  const window = due - new Date(r.reportedAt).getTime()
  const remaining = due - now
  const state: DeadlineState = remaining <= Math.max(window * APPROACHING_FRACTION, 60 * 60_000) ? 'approaching' : 'on_track'
  return { state, kind, dueAt: r.deadlines[kind], msRemaining: remaining }
}

/** Allowed workflow transitions for department staff. Supervisors share these and can also reassign. */
export const STAFF_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  open: ['assigned', 'rejected'],
  assigned: ['in_progress', 'rejected'],
  reopened: ['in_progress'],
  in_progress: ['resolved'],
  resolved: [],
  rejected: [],
}

export function nextStatuses(status: ReportStatus): ReportStatus[] {
  return STAFF_TRANSITIONS[status]
}
