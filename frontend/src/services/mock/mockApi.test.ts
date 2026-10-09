import { beforeEach, describe, expect, it } from 'vitest'
import { getUser } from '@/data/directory'
import { resetDemoData, getDb, syncEscalations } from './store'
import { canViewReport, computeHotspots, mockApi } from './mockApi'

const citizen = getUser('usr-cit-1')!
const otherCitizen = getUser('usr-cit-2')!
const swmStaff = getUser('usr-stf-swm-1')! // Solid Waste, North + Central zones
const drainsStaff = getUser('usr-stf-swd-1')!
const supervisor = getUser('usr-sup-1')!
const photo = 'data:image/jpeg;base64,AAAA'

beforeEach(() => {
  localStorage.clear()
  resetDemoData()
})

describe('scope rules (mirrors planned backend checks)', () => {
  it('staff only see their department and zones', () => {
    for (const r of getDb().reports) {
      const visible = canViewReport(swmStaff, r)
      if (visible) {
        expect(r.departmentId ?? 'dept-swm').toBe('dept-swm')
        expect(['zone-n', 'zone-c']).toContain(r.zoneId)
      }
    }
  })

  it('citizens can only open their own complaints', async () => {
    const own = getDb().reports.find((r) => r.citizenId === citizen.id)!
    await expect(mockApi.citizen.get(citizen, own.id)).resolves.toBeTruthy()
    await expect(mockApi.citizen.get(otherCitizen, own.id)).rejects.toMatchObject({ status: 403 })
  })

  it('staff cannot open complaints outside scope', async () => {
    const drain = getDb().reports.find((r) => r.category === 'drainage')!
    await expect(mockApi.work.get(swmStaff, drain.id)).rejects.toMatchObject({ status: 403 })
    await expect(mockApi.work.get(drainsStaff, drain.id)).resolves.toBeTruthy()
  })

  it('citizens cannot use staff or supervisor endpoints', async () => {
    await expect(mockApi.work.list(citizen)).rejects.toMatchObject({ status: 403 })
    await expect(mockApi.supervisor.escalations(citizen)).rejects.toMatchObject({ status: 403 })
  })

  it('public reports expose no reporter identity', async () => {
    const list = await mockApi.publicReports.list()
    expect(list.every((r) => !('citizenId' in r) && !('assignedStaffId' in r))).toBe(true)
  })
})

describe('report workflow', () => {
  it('validates new reports', async () => {
    await expect(mockApi.citizen.create(citizen, { category: 'garbage', description: 'short', latitude: 13, longitude: 80, address: '', landmark: '', photoDataUrl: '' })).rejects.toMatchObject({
      status: 422,
    })
  })

  it('runs create → accept → in progress → resolve with history', async () => {
    const r = await mockApi.citizen.create(citizen, { category: 'drainage', description: 'Drain blocked and overflowing near the school gate.', latitude: 13.05, longitude: 80.24, address: '1 Test Road', landmark: '', photoDataUrl: photo })
    expect(r.status).toBe('open')
    await mockApi.work.accept(drainsStaff, r.id, '')
    await mockApi.work.updateStatus(drainsStaff, r.id, { newStatus: 'in_progress', comment: 'Crew on site now.' })
    await expect(mockApi.work.updateStatus(drainsStaff, r.id, { newStatus: 'resolved', comment: 'All cleared up.', resolutionSummary: 'Drain desilted over 20 m and cleared.' })).rejects.toMatchObject({ status: 422 })
    await mockApi.work.addEvidence(drainsStaff, r.id, { dataUrl: photo, type: 'resolution', caption: '' })
    const done = await mockApi.work.updateStatus(drainsStaff, r.id, { newStatus: 'resolved', comment: 'All cleared up.', resolutionSummary: 'Drain desilted over 20 m and cleared.' })
    expect(done.status).toBe('resolved')
    const history = getDb().history.filter((h) => h.reportId === r.id).map((h) => h.newStatus)
    expect(history).toEqual(['open', 'assigned', 'in_progress', 'resolved'])
  })

  it('rejects invalid status jumps', async () => {
    const r = getDb().reports.find((x) => x.status === 'assigned')!
    const staff = getUser(r.assignedStaffId)!
    await expect(mockApi.work.updateStatus(staff, r.id, { newStatus: 'resolved', comment: 'Skipping ahead.' })).rejects.toMatchObject({ status: 422 })
  })

  it('requires a reason for extension decisions', async () => {
    const ext = getDb().extensions.find((x) => x.status === 'pending')
    if (!ext) return
    await expect(mockApi.supervisor.reviewExtension(supervisor, ext.id, { decision: 'approved', reason: '' })).rejects.toMatchObject({ status: 422 })
    await mockApi.supervisor.reviewExtension(supervisor, ext.id, { decision: 'approved', reason: 'Verified equipment delay.' })
    expect(getDb().reports.find((r) => r.id === ext.reportId)!.deadlines[ext.deadlineKind]).toBe(ext.requestedDeadline)
  })
})

describe('escalations', () => {
  it('are idempotent across repeated deadline checks', () => {
    const before = getDb().escalations.length
    syncEscalations(getDb(), Date.now())
    syncEscalations(getDb(), Date.now())
    expect(getDb().escalations.length).toBe(before)
  })

  it('exist for every overdue active complaint', async () => {
    const overdue = await mockApi.work.list(supervisor, { overdueOnly: true })
    for (const r of overdue) expect(getDb().escalations.some((e) => e.reportId === r.id)).toBe(true)
  })
})

describe('hotspots', () => {
  it('groups nearby reports and ignores isolated ones', () => {
    const mk = (id: string, lat: number, lng: number) => ({ ...getDb().reports[0], id, latitude: lat, longitude: lng })
    const spots = computeHotspots([mk('a', 13, 80), mk('b', 13.0005, 80.0005), mk('c', 13.001, 80), mk('far', 13.2, 80.2)])
    expect(spots).toHaveLength(1)
    expect(spots[0].reportIds.sort()).toEqual(['a', 'b', 'c'])
  })
})
