import { describe, expect, it } from 'vitest'
import { createSeedDatabase } from '@/data/seed'
import { getDeadlineInfo } from '@/lib/domain'
import type { Report } from '@/types'

const HOUR = 3_600_000
const base = Date.parse('2026-10-01T00:00:00Z')

function report(partial: Partial<Report>): Report {
  return {
    id: 'r1',
    publicId: 'CV-2026-00001',
    citizenId: 'c1',
    category: 'garbage',
    description: 'test',
    latitude: 0,
    longitude: 0,
    address: '',
    landmark: '',
    severity: 'medium',
    status: 'open',
    departmentId: null,
    zoneId: null,
    assignedStaffId: null,
    reportedAt: new Date(base).toISOString(),
    updatedAt: new Date(base).toISOString(),
    deadlines: {
      acknowledgement: new Date(base + 24 * HOUR).toISOString(),
      action: new Date(base + 72 * HOUR).toISOString(),
      resolution: new Date(base + 168 * HOUR).toISOString(),
    },
    originalDeadlines: { acknowledgement: '', action: '', resolution: '' },
    acknowledgedAt: null,
    actionStartedAt: null,
    resolvedAt: null,
    resolutionSummary: null,
    rejectionReason: null,
    aiSuggestedCategory: null,
    aiExplanation: null,
    isDemo: true,
    ...partial,
  }
}

describe('getDeadlineInfo', () => {
  it('is on track early in the acknowledgement window', () => {
    const info = getDeadlineInfo(report({}), base + 2 * HOUR)
    expect(info.state).toBe('on_track')
    expect(info.kind).toBe('acknowledgement')
  })

  it('is approaching in the last quarter of the window', () => {
    expect(getDeadlineInfo(report({}), base + 20 * HOUR).state).toBe('approaching')
  })

  it('is overdue once an unmet deadline passes', () => {
    const info = getDeadlineInfo(report({}), base + 30 * HOUR)
    expect(info.state).toBe('overdue')
    expect(info.kind).toBe('acknowledgement')
  })

  it('tracks the next stage after acknowledgement', () => {
    const r = report({ status: 'assigned', acknowledgedAt: new Date(base + 2 * HOUR).toISOString() })
    expect(getDeadlineInfo(r, base + 30 * HOUR)).toMatchObject({ state: 'on_track', kind: 'action' })
  })

  it('reports met / missed for resolved complaints', () => {
    const onTime = report({ status: 'resolved', resolvedAt: new Date(base + 100 * HOUR).toISOString() })
    const late = report({ status: 'resolved', resolvedAt: new Date(base + 200 * HOUR).toISOString() })
    expect(getDeadlineInfo(onTime, base + 300 * HOUR).state).toBe('met')
    expect(getDeadlineInfo(late, base + 300 * HOUR).state).toBe('missed')
  })

  it('does not apply deadlines to rejected complaints', () => {
    expect(getDeadlineInfo(report({ status: 'rejected' }), base + 500 * HOUR).state).toBe('not_applicable')
  })

  it('is independent of severity', () => {
    const now = base + 30 * HOUR
    expect(getDeadlineInfo(report({ severity: 'low' }), now).state).toBe(getDeadlineInfo(report({ severity: 'critical' }), now).state)
  })
})

describe('seed data', () => {
  const now = Date.parse('2026-10-09T12:00:00Z')
  const db = createSeedDatabase(now)

  it('is deterministic for the same clock', () => {
    expect(createSeedDatabase(now).reports.map((r) => r.publicId)).toEqual(db.reports.map((r) => r.publicId))
  })

  it('never places events in the future', () => {
    const times = [...db.reports.map((r) => r.reportedAt), ...db.history.map((h) => h.createdAt), ...db.evidence.map((e) => e.createdAt)]
    expect(times.every((t) => Date.parse(t) <= now)).toBe(true)
  })

  it('keeps every timeline in order', () => {
    for (const r of db.reports) {
      const steps = [r.reportedAt, r.acknowledgedAt, r.actionStartedAt, r.resolvedAt].filter(Boolean).map((t) => Date.parse(t!))
      expect(steps).toEqual([...steps].sort((a, b) => a - b))
    }
  })

  it('covers every status and includes resolution evidence for resolved complaints', () => {
    const statuses = new Set(db.reports.map((r) => r.status))
    for (const s of ['open', 'assigned', 'in_progress', 'resolved', 'rejected', 'reopened']) expect(statuses.has(s as Report['status'])).toBe(true)
    for (const r of db.reports.filter((x) => x.status === 'resolved')) {
      expect(db.evidence.some((e) => e.reportId === r.id && e.type === 'resolution')).toBe(true)
    }
  })

  it('labels every record as demo data', () => {
    expect(db.reports.every((r) => r.isDemo)).toBe(true)
    expect(db.evidence.every((e) => e.isPlaceholder)).toBe(true)
  })
})
