/**
 * Service contract used by every page. Phase 1 provides a browser-only mock implementation;
 * Phase 2 provides an HTTP implementation against the FastAPI backend with the same shape.
 */
import type {
  AiClassifyResult,
  AppNotification,
  DuplicateCandidate,
  AuditLogEntry,
  DeadlineExtensionRequest,
  DeadlineKind,
  Department,
  EscalationEvent,
  EscalationStatus,
  Evidence,
  EvidenceType,
  Feedback,
  Hotspot,
  IssueCategory,
  NewReportInput,
  PublicReport,
  PublicReportBundle,
  Report,
  ReportBundle,
  ReportFilters,
  ReportStatus,
  Severity,
  SlaPolicy,
  StatusUpdateInput,
  TimelineEntry,
  UserProfile,
  Zone,
} from '@/types'

export interface SummaryStats {
  total: number
  active: number
  resolved: number
  rejected: number
  overdue: number
  approaching: number
  criticalActive: number
  byStatus: Record<ReportStatus, number>
  byCategory: Record<IssueCategory, number>
  bySeverity: Record<Severity, number>
  avgResolutionHours: number | null
  resolvedOnTimeRate: number | null
  openEscalations: number
  pendingExtensions: number
  pendingDisputes: number
}

export interface DepartmentStats {
  departmentId: string
  name: string
  total: number
  active: number
  resolved: number
  overdue: number
  critical: number
  avgResolutionHours: number | null
  onTimeRate: number | null
}

export interface TrendPoint {
  weekStart: string
  reported: number
  resolved: number
}

export interface ScopedReportRow extends Report {
  /** Pre-computed for convenience in tables. */
  departmentName: string | null
  assignedStaffName: string | null
  zoneName: string | null
  pendingExtension: boolean
  openEscalations: number
}

export interface ExtensionRow extends DeadlineExtensionRequest {
  report: Report
  requestedByName: string
  reviewedByName?: string | null
}

export interface EscalationRow extends EscalationEvent {
  report: Report
  reviewedByName?: string | null
}

export interface ReporterContact {
  displayName: string
  email: string | null
  phone: string | null
}

export type WorkBundle = ReportBundle & { timeline: TimelineEntry[]; reporter?: ReporterContact | null }

export interface DisputeRow extends Feedback {
  report: Report
}

export interface AuditFilters {
  reportId?: string
  actorId?: string
  entityType?: AuditLogEntry['entityType']
  limit?: number
}

export interface CivicApi {
  directory: {
    departments(): Promise<Department[]>
    zones(): Promise<Zone[]>
    staff(departmentId?: string): Promise<UserProfile[]>
    slaPolicies(): Promise<SlaPolicy[]>
  }
  publicReports: {
    list(filters?: ReportFilters): Promise<PublicReport[]>
    get(id: string): Promise<PublicReportBundle>
    findByPublicId(publicId: string): Promise<PublicReport | null>
  }
  citizen: {
    create(user: UserProfile, input: NewReportInput): Promise<Report>
    mine(user: UserProfile): Promise<Report[]>
    get(user: UserProfile, id: string): Promise<{ report: Report; timeline: TimelineEntry[]; evidence: Evidence[]; feedback: Feedback[] }>
    submitFeedback(user: UserProfile, reportId: string, input: { rating: number; comment: string; reopenRequested: boolean }): Promise<Feedback>
    findDuplicates(user: UserProfile, input: { latitude: number; longitude: number; category: IssueCategory; description: string }): Promise<DuplicateCandidate[]>
  }
  ai: {
    /** Pretrained-model category suggestion for a photo. Never fabricates: returns available=false when it cannot help. */
    classify(user: UserProfile, photoDataUrl: string): Promise<AiClassifyResult>
  }
  work: {
    list(user: UserProfile, filters?: ReportFilters): Promise<ScopedReportRow[]>
    get(user: UserProfile, id: string): Promise<WorkBundle>
    updateSeverity(user: UserProfile, id: string, input: { severity: Severity; reason: string }): Promise<Report>
    accept(user: UserProfile, id: string, note: string): Promise<Report>
    assign(user: UserProfile, id: string, input: { departmentId: string; staffId: string | null; reason: string }): Promise<Report>
    updateStatus(user: UserProfile, id: string, input: StatusUpdateInput): Promise<Report>
    addNote(user: UserProfile, id: string, input: { body: string; internal: boolean }): Promise<void>
    addEvidence(user: UserProfile, id: string, input: { dataUrl: string; type: EvidenceType; caption: string }): Promise<Evidence>
    requestExtension(user: UserProfile, id: string, input: { deadlineKind: DeadlineKind; requestedDeadline: string; reason: string }): Promise<DeadlineExtensionRequest>
  }
  supervisor: {
    extensions(user: UserProfile, status?: DeadlineExtensionRequest['status']): Promise<ExtensionRow[]>
    reviewExtension(user: UserProfile, id: string, input: { decision: 'approved' | 'rejected'; reason: string }): Promise<void>
    escalations(user: UserProfile): Promise<EscalationRow[]>
    reviewEscalation(user: UserProfile, id: string, input: { status: EscalationStatus; actionTaken: string }): Promise<void>
    disputes(user: UserProfile): Promise<DisputeRow[]>
    decideReopen(user: UserProfile, feedbackId: string, input: { decision: 'approved' | 'declined'; reason: string }): Promise<void>
    audit(user: UserProfile, filters?: AuditFilters): Promise<AuditLogEntry[]>
  }
  analytics: {
    summary(user: UserProfile | null, filters?: ReportFilters): Promise<SummaryStats>
    departments(user: UserProfile, filters?: ReportFilters): Promise<DepartmentStats[]>
    trend(user: UserProfile, weeks?: number, filters?: ReportFilters): Promise<TrendPoint[]>
    hotspots(user: UserProfile | null, filters?: ReportFilters): Promise<Hotspot[]>
  }
  notifications: {
    list(user: UserProfile): Promise<AppNotification[]>
    markRead(user: UserProfile, ids: string[] | 'all'): Promise<void>
  }
  auth: {
    registerDemoCitizen(input: { displayName: string; email: string }): Promise<UserProfile>
  }
  admin: {
    users(user: UserProfile): Promise<UserProfile[]>
    createUser(user: UserProfile, input: AdminUserInput & { displayName: string; email: string; password: string }): Promise<UserProfile>
    updateUser(user: UserProfile, id: string, input: AdminUserInput): Promise<UserProfile>
    accessRequests(user: UserProfile, status?: AccessRequest['status']): Promise<AccessRequest[]>
    decideAccess(user: UserProfile, id: string, input: Partial<AdminUserInput> & { decision: 'approved' | 'rejected'; reason: string }): Promise<AccessRequest>
    /** The signed-in user's latest access request (null if none). */
    myAccessRequest(user: UserProfile): Promise<AccessRequest | null>
  }
}

export interface AccessRequest {
  id: string
  userId: string
  displayName: string
  email: string | null
  requestedRole: 'staff' | 'supervisor'
  departmentId: string | null
  note: string
  status: 'pending' | 'approved' | 'rejected'
  decisionReason: string | null
  createdAt: string
  decidedAt: string | null
}

export interface AdminUserInput {
  role: UserProfile['role']
  departmentId: string | null
  zoneIds: string[]
  allZones: boolean
  title?: string | null
}
