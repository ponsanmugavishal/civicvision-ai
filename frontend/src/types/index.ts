/**
 * Core domain models for CIVICVISION AI.
 * These mirror the planned Supabase schema (Phase 2) so the mock service layer
 * can be swapped for real API calls without touching page components.
 */

export type Role = 'citizen' | 'staff' | 'supervisor' | 'administrator'

export type IssueCategory = 'garbage' | 'drainage' | 'pothole' | 'other'

export type ReportStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'rejected' | 'reopened'

/** How serious the issue is. Independent from deadline status. */
export type Severity = 'low' | 'medium' | 'high' | 'critical'

/** Whether a response target is on track, approaching or missed. Independent from severity. */
export type DeadlineState = 'on_track' | 'approaching' | 'overdue' | 'met' | 'missed' | 'not_applicable'

export type DeadlineKind = 'acknowledgement' | 'action' | 'resolution'

export type EvidenceType = 'original' | 'progress' | 'resolution' | 'other'

export interface Department {
  id: string
  name: string
  shortName: string
  description: string
  categories: IssueCategory[]
  active: boolean
}

export interface Zone {
  id: string
  name: string
  description: string
  /** Approximate centre used for demo data generation and map framing. */
  center: [number, number]
}

export interface UserProfile {
  id: string
  displayName: string
  role: Role
  departmentId: string | null
  /** Zones the user is authorised for. In demo mode an empty array means all zones. */
  zoneIds: string[]
  /** API mode: explicit all-zones grant (never inferred from an empty list). */
  allZones?: boolean
  /** Sample contact details only — never shown in public views. */
  email: string | null
  phone?: string | null
  title?: string | null
  isDemo: boolean
}

export interface Deadlines {
  acknowledgement: string
  action: string
  resolution: string
}

export interface StatusHistoryEntry {
  id: string
  reportId: string
  previousStatus: ReportStatus | null
  newStatus: ReportStatus
  changedBy: string
  changedByRole: Role
  comment: string
  createdAt: string
}

export interface ProgressNote {
  id: string
  reportId: string
  authorId: string
  authorRole: Role
  body: string
  /** Internal notes are never returned by public or citizen views. */
  internal: boolean
  createdAt: string
}

export interface Evidence {
  id: string
  reportId: string
  uploadedBy: string
  uploadedByRole: Role
  /** In mock mode this is a data URL / generated placeholder; in Phase 2 a Supabase Storage path. */
  url: string
  type: EvidenceType
  caption: string
  isPlaceholder: boolean
  createdAt: string
}

export interface Assignment {
  id: string
  reportId: string
  departmentId: string
  assignedStaffId: string | null
  assignedBy: string
  reason: string
  assignedAt: string
  unassignedAt: string | null
}

export type ExtensionStatus = 'pending' | 'approved' | 'rejected'

export interface DeadlineExtensionRequest {
  id: string
  reportId: string
  deadlineKind: DeadlineKind
  currentDeadline: string
  requestedDeadline: string
  requestedBy: string
  reason: string
  status: ExtensionStatus
  reviewedBy: string | null
  reviewReason: string | null
  createdAt: string
  reviewedAt: string | null
}

export type EscalationStatus = 'open' | 'under_review' | 'actioned' | 'closed'

export interface EscalationEvent {
  id: string
  reportId: string
  level: 1 | 2 | 3
  reason: string
  deadlineKind: DeadlineKind
  deadlineAt: string
  triggeredAt: string
  notifiedRole: Role
  actionTaken: string | null
  status: EscalationStatus
  reviewedBy: string | null
  reviewedAt: string | null
}

export interface Feedback {
  id: string
  reportId: string
  citizenId: string
  /** 1–5 satisfaction rating. */
  rating: number
  comment: string
  reopenRequested: boolean
  reopenDecision: 'pending' | 'approved' | 'declined' | null
  decisionReason: string | null
  decidedBy: string | null
  createdAt: string
}

export interface Report {
  id: string
  /** Human-readable public identifier, e.g. CV-2026-00042. */
  publicId: string
  citizenId: string
  category: IssueCategory
  description: string
  latitude: number
  longitude: number
  address: string
  landmark: string
  severity: Severity
  status: ReportStatus
  departmentId: string | null
  zoneId: string | null
  assignedStaffId: string | null
  reportedAt: string
  updatedAt: string
  deadlines: Deadlines
  /** Deadlines first set when the report was created — kept for audit when extended. */
  originalDeadlines: Deadlines
  acknowledgedAt: string | null
  actionStartedAt: string | null
  resolvedAt: string | null
  resolutionSummary: string | null
  rejectionReason: string | null
  /** Phase 3: AI-suggested category stored separately from the citizen-confirmed category. */
  aiSuggestedCategory: IssueCategory | null
  aiExplanation: string | null
  /** Tentative severity from the AI; never applied automatically. */
  aiSuggestedSeverity?: Severity | null
  /** Reports flagged as possible duplicates when this one was submitted (warning only). */
  possibleDuplicateIds?: string[]
  isDemo: boolean
}

/** Fields safe to show to anyone (public map / public detail). */
export interface PublicReport {
  id: string
  publicId: string
  category: IssueCategory
  description: string
  latitude: number
  longitude: number
  address: string
  landmark: string
  severity: Severity
  status: ReportStatus
  departmentId: string | null
  zoneId: string | null
  reportedAt: string
  updatedAt: string
  deadlines: Deadlines
  acknowledgedAt: string | null
  actionStartedAt: string | null
  resolvedAt: string | null
  resolutionSummary: string | null
  isDemo: boolean
}

export interface TimelineEntry {
  id: string
  kind: 'status' | 'evidence' | 'note' | 'assignment' | 'extension' | 'escalation' | 'feedback'
  title: string
  detail: string
  actorLabel: string
  createdAt: string
  status?: ReportStatus
  internal?: boolean
}

export interface ReportBundle {
  report: Report
  history: StatusHistoryEntry[]
  evidence: Evidence[]
  notes: ProgressNote[]
  feedback: Feedback[]
  assignments: Assignment[]
  extensions: DeadlineExtensionRequest[]
  escalations: EscalationEvent[]
}

export interface PublicReportBundle {
  report: PublicReport
  timeline: TimelineEntry[]
  evidence: Evidence[]
}

export interface AuditLogEntry {
  id: string
  actorId: string
  actorRole: Role
  /** Provided by the API so names resolve without a full user directory. */
  actorName?: string | null
  action: string
  entityType: 'report' | 'assignment' | 'evidence' | 'extension' | 'escalation' | 'feedback' | 'profile'
  entityId: string
  reportId: string | null
  summary: string
  createdAt: string
}

export interface AppNotification {
  id: string
  userId: string
  title: string
  body: string
  link: string | null
  read: boolean
  createdAt: string
  /** In-app only. No email/SMS/push delivery exists in Phase 1. */
  channel: 'in_app'
}

export interface SlaPolicy {
  id: string
  category: IssueCategory
  severity: Severity
  acknowledgementHours: number
  actionHours: number
  resolutionHours: number
  enabled: boolean
}

export interface ReportFilters {
  search?: string
  categories?: IssueCategory[]
  statuses?: ReportStatus[]
  severities?: Severity[]
  departmentIds?: string[]
  zoneIds?: string[]
  dateFrom?: string
  dateTo?: string
  overdueOnly?: boolean
}

export interface NewReportInput {
  category: IssueCategory
  description: string
  latitude: number
  longitude: number
  address: string
  landmark: string
  photoDataUrl: string
  /** Server-issued id of an AI suggestion the citizen saw (the confirmed category is still `category`). */
  aiSuggestionId?: string | null
}

export interface AiSuggestion {
  id: string
  suggestedCategory: IssueCategory
  explanation: string
  visibleIndicators: string[]
  uncertaintyWarning: string | null
  suggestedSeverity: Severity | null
  model: string
}

export interface AiClassifyResult {
  available: boolean
  message: string
  suggestion: AiSuggestion | null
}

export interface DuplicateCandidate {
  id: string
  publicId: string
  category: IssueCategory
  status: ReportStatus
  distanceM: number
  reportedAt: string
  description: string
  textSimilarity: number
}

export interface StatusUpdateInput {
  newStatus: ReportStatus
  comment: string
  resolutionSummary?: string
}

export interface Hotspot {
  id: string
  latitude: number
  longitude: number
  count: number
  activeCount: number
  categories: Partial<Record<IssueCategory, number>>
  reportIds: string[]
  publicIds: string[]
  label: string
}
