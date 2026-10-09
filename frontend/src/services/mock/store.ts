/**
 * Browser-only demo data store (Phase 1).
 *
 * Records live in memory and are mirrored to this browser's localStorage so the demo survives a reload.
 * NOTHING here is sent to a server or saved to a real database. Phase 2 replaces this module with
 * calls to the FastAPI backend backed by Supabase PostgreSQL.
 */
import { createSeedDatabase, DEMO_DB_VERSION, type DemoDatabase } from '@/data/seed'
import { USERS } from '@/data/directory'
import { isActive } from '@/lib/domain'
import type { DeadlineKind, EscalationEvent, Report } from '@/types'
import { bumpData } from '../dataEvents'

const STORAGE_KEY = 'civicvision.demo-db'

// Loaded lazily so API mode never creates demo data in the browser.
let db: DemoDatabase | null = null
let persistWarning: string | null = null

function load(): DemoDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDatabase
      if (parsed.version === DEMO_DB_VERSION) {
        registerUsers(parsed)
        syncEscalations(parsed, Date.now())
        return parsed
      }
    }
  } catch {
    // Corrupt or inaccessible storage — fall back to a fresh seed.
  }
  return seed()
}

function seed(): DemoDatabase {
  const fresh = createSeedDatabase()
  syncEscalations(fresh, Date.now(), true)
  seedNotifications(fresh)
  return fresh
}

function registerUsers(d: DemoDatabase) {
  for (const u of d.registeredUsers) {
    if (!USERS.some((x) => x.id === u.id)) USERS.push(u)
  }
}

export function getDb(): DemoDatabase {
  if (!db) db = load()
  return db
}

/** Demo mode: load (or seed) the browser store and register demo accounts created in this browser. */
export function initDemoStore(): void {
  getDb()
}

export function getPersistWarning(): string | null {
  return persistWarning
}

/** Apply a mutation, re-run the deadline check, persist, and notify subscribers. */
export function commit<T>(mutator: (d: DemoDatabase) => T): T {
  const d = getDb()
  const result = mutator(d)
  syncEscalations(d, Date.now())
  persist()
  bumpData()
  return result
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getDb()))
    persistWarning = null
  } catch {
    persistWarning = 'Browser storage is full or unavailable — demo changes will be lost on reload.'
  }
}

export function resetDemoData() {
  const current = getDb()
  for (let i = USERS.length - 1; i >= 0; i--) {
    if (current.registeredUsers.some((u) => u.id === USERS[i].id)) USERS.splice(i, 1)
  }
  db = seed()
  persist()
  bumpData()
}

export function newId(prefix: string): string {
  const d = getDb()
  d.counters.id++
  return `${prefix}-${String(d.counters.id).padStart(5, '0')}-${Math.random().toString(36).slice(2, 6)}`
}

/** When each stage was completed, or null if it is still outstanding. */
function stageCompletion(r: Report, kind: DeadlineKind, d: DemoDatabase): string | null {
  if (kind === 'acknowledgement') return r.acknowledgedAt
  if (kind === 'action') return r.actionStartedAt ?? r.resolvedAt
  if (r.resolvedAt) return r.resolvedAt
  if (r.status === 'rejected') {
    const h = d.history.findLast((x) => x.reportId === r.id && x.newStatus === 'rejected')
    return h?.createdAt ?? r.updatedAt
  }
  return null
}

const LEVEL: Record<DeadlineKind, 1 | 2 | 3> = { acknowledgement: 1, action: 2, resolution: 3 }

/**
 * Demo stand-in for the Phase 3 scheduled SLA job. Idempotent: an escalation is keyed by
 * (report, deadline kind, deadline timestamp), so re-running never duplicates events, and an
 * extended deadline that is later missed produces a new, separate event. Earlier breaches are never erased.
 */
export function syncEscalations(d: DemoDatabase, now: number, seeding = false) {
  const keys = new Set(d.escalations.map((e) => `${e.reportId}|${e.deadlineKind}|${e.deadlineAt}`))
  const supervisors = USERS.filter((u) => u.role === 'supervisor')
  let n = 0
  for (const r of d.reports) {
    if (r.status === 'rejected' && !seeding) continue
    for (const kind of ['acknowledgement', 'action', 'resolution'] as DeadlineKind[]) {
      const deadlineAt = r.deadlines[kind]
      const due = new Date(deadlineAt).getTime()
      if (due > now) continue
      const done = stageCompletion(r, kind, d)
      if (done && new Date(done).getTime() <= due) continue
      const key = `${r.id}|${kind}|${deadlineAt}`
      if (keys.has(key)) continue
      keys.add(key)
      const level = Math.min(3, LEVEL[kind] + (r.severity === 'critical' ? 1 : 0)) as 1 | 2 | 3
      const stillActive = isActive(r.status) && !done
      n++
      const event: EscalationEvent = {
        id: `esc-${r.id}-${kind}-${due}`,
        reportId: r.id,
        level,
        reason: `${kind === 'acknowledgement' ? 'Acknowledgement' : kind === 'action' ? 'Initial action' : 'Resolution'} target missed for a ${r.severity} ${r.category} complaint.`,
        deadlineKind: kind,
        deadlineAt,
        triggeredAt: new Date(due + 5 * 60_000).toISOString(),
        notifiedRole: 'supervisor',
        actionTaken: stillActive ? null : 'Closed automatically: stage was completed after the deadline (breach retained for audit).',
        status: stillActive ? (seeding && n % 5 === 0 ? 'under_review' : 'open') : 'closed',
        reviewedBy: null,
        reviewedAt: null,
      }
      d.escalations.push(event)
      d.audit.push({
        id: `aud-${event.id}`,
        actorId: 'system',
        actorRole: 'administrator',
        action: 'escalation.created',
        entityType: 'escalation',
        entityId: event.id,
        reportId: r.id,
        summary: `${r.publicId}: level ${level} escalation — ${kind} deadline missed`,
        createdAt: event.triggeredAt,
      })
      if (!seeding && stillActive) {
        for (const s of supervisors) {
          d.notifications.push({
            id: `ntf-${event.id}-${s.id}`,
            userId: s.id,
            title: `Escalation: ${r.publicId}`,
            body: event.reason,
            link: `/supervisor/reports/${r.id}`,
            read: false,
            createdAt: event.triggeredAt,
            channel: 'in_app',
          })
        }
      }
    }
  }
}

function seedNotifications(d: DemoDatabase) {
  const now = Date.now()
  const recent = d.history.filter((h) => h.previousStatus && now - new Date(h.createdAt).getTime() < 12 * 86_400_000)
  for (const h of recent) {
    const r = d.reports.find((x) => x.id === h.reportId)
    if (!r) continue
    d.notifications.push({
      id: `ntf-${h.id}`,
      userId: r.citizenId,
      title: `${r.publicId} is now ${h.newStatus.replace('_', ' ')}`,
      body: h.comment,
      link: `/citizen/reports/${r.id}`,
      read: now - new Date(h.createdAt).getTime() > 2 * 86_400_000,
      createdAt: h.createdAt,
      channel: 'in_app',
    })
  }
  const open = d.escalations.filter((e) => e.status === 'open').slice(-6)
  for (const e of open) {
    const r = d.reports.find((x) => x.id === e.reportId)!
    d.notifications.push({
      id: `ntf-${e.id}`,
      userId: 'usr-sup-1',
      title: `Escalation: ${r.publicId}`,
      body: e.reason,
      link: `/supervisor/reports/${r.id}`,
      read: false,
      createdAt: e.triggeredAt,
      channel: 'in_app',
    })
  }
}
