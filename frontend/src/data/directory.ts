/**
 * DEMO DIRECTORY — fictional departments, zones and people.
 * All names and contact details are invented samples (example.org addresses, placeholder phone numbers).
 * They do not represent any real government body or person.
 */
import type { Department, IssueCategory, Severity, SlaPolicy, UserProfile, Zone } from '@/types'
import { env } from '@/config/env'

const [cLat, cLng] = env.map.center

export const DEPARTMENTS: Department[] = [
  {
    id: 'dept-swm',
    name: 'Solid Waste Management (Demo)',
    shortName: 'Solid Waste',
    description: 'Collection, clearance of dumping spots and bin maintenance.',
    categories: ['garbage'],
    active: true,
  },
  {
    id: 'dept-swd',
    name: 'Stormwater Drains & Sewerage (Demo)',
    shortName: 'Drains',
    description: 'Drain desilting, overflow response and waterlogging relief.',
    categories: ['drainage'],
    active: true,
  },
  {
    id: 'dept-roads',
    name: 'Roads & Street Maintenance (Demo)',
    shortName: 'Roads',
    description: 'Pothole patching, resurfacing and road-edge repairs.',
    categories: ['pothole'],
    active: true,
  },
  {
    id: 'dept-ward',
    name: 'Ward Civic Services (Demo)',
    shortName: 'Ward Services',
    description: 'General civic issues that need triage before routing.',
    categories: ['other'],
    active: true,
  },
]

export const ZONES: Zone[] = [
  { id: 'zone-n', name: 'North Zone', description: 'Demo zone — northern wards', center: [cLat + 0.026, cLng + 0.004] },
  { id: 'zone-c', name: 'Central Zone', description: 'Demo zone — central wards', center: [cLat + 0.002, cLng + 0.006] },
  { id: 'zone-s', name: 'South Zone', description: 'Demo zone — southern wards', center: [cLat - 0.026, cLng + 0.002] },
  { id: 'zone-w', name: 'West Zone', description: 'Demo zone — western wards', center: [cLat + 0.001, cLng - 0.03] },
]

export const CATEGORY_DEPARTMENT: Record<IssueCategory, string> = {
  garbage: 'dept-swm',
  drainage: 'dept-swd',
  pothole: 'dept-roads',
  other: 'dept-ward',
}

export const USERS: UserProfile[] = [
  // Citizens
  { id: 'usr-cit-1', displayName: 'Asha Raman', role: 'citizen', departmentId: null, zoneIds: [], email: 'asha.sample@example.org', phone: '+91 90000 00001', isDemo: true },
  { id: 'usr-cit-2', displayName: 'Vikram Sundar', role: 'citizen', departmentId: null, zoneIds: [], email: 'vikram.sample@example.org', phone: '+91 90000 00002', isDemo: true },
  { id: 'usr-cit-3', displayName: 'Meera Krishnan', role: 'citizen', departmentId: null, zoneIds: [], email: 'meera.sample@example.org', phone: '+91 90000 00003', isDemo: true },
  { id: 'usr-cit-4', displayName: 'Farhan Ali', role: 'citizen', departmentId: null, zoneIds: [], email: 'farhan.sample@example.org', isDemo: true },
  // Department staff
  { id: 'usr-stf-swm-1', displayName: 'Karthik Natarajan', role: 'staff', departmentId: 'dept-swm', zoneIds: ['zone-n', 'zone-c'], email: 'karthik.staff@example.org', title: 'Sanitation Inspector', isDemo: true },
  { id: 'usr-stf-swm-2', displayName: 'Divya Prakash', role: 'staff', departmentId: 'dept-swm', zoneIds: ['zone-s', 'zone-w'], email: 'divya.staff@example.org', title: 'Sanitation Inspector', isDemo: true },
  { id: 'usr-stf-swd-1', displayName: 'Rahul Menon', role: 'staff', departmentId: 'dept-swd', zoneIds: [], email: 'rahul.staff@example.org', title: 'Assistant Engineer (Drains)', isDemo: true },
  { id: 'usr-stf-swd-2', displayName: 'Sneha Pillai', role: 'staff', departmentId: 'dept-swd', zoneIds: [], email: 'sneha.staff@example.org', title: 'Junior Engineer (Drains)', isDemo: true },
  { id: 'usr-stf-rd-1', displayName: 'Arun Balaji', role: 'staff', departmentId: 'dept-roads', zoneIds: [], email: 'arun.staff@example.org', title: 'Assistant Engineer (Roads)', isDemo: true },
  { id: 'usr-stf-rd-2', displayName: 'Nisha Thomas', role: 'staff', departmentId: 'dept-roads', zoneIds: [], email: 'nisha.staff@example.org', title: 'Road Works Supervisor', isDemo: true },
  { id: 'usr-stf-wd-1', displayName: 'Joseph Daniel', role: 'staff', departmentId: 'dept-ward', zoneIds: [], email: 'joseph.staff@example.org', title: 'Ward Officer', isDemo: true },
  // Supervisors
  { id: 'usr-sup-1', displayName: 'Lakshmi Iyer', role: 'supervisor', departmentId: null, zoneIds: [], email: 'lakshmi.supervisor@example.org', title: 'Zonal Oversight Officer (all zones)', isDemo: true },
]

/** Personas offered on the demo sign-in screen. */
export const DEMO_PERSONAS: { userId: string; blurb: string }[] = [
  { userId: 'usr-cit-1', blurb: 'Report issues, track your complaints, give feedback.' },
  { userId: 'usr-stf-swm-1', blurb: 'Solid Waste staff — North & Central zones only.' },
  { userId: 'usr-stf-swd-1', blurb: 'Drains staff — all zones, drainage complaints only.' },
  { userId: 'usr-stf-rd-1', blurb: 'Roads staff — all zones, pothole complaints only.' },
  { userId: 'usr-sup-1', blurb: 'Oversight of every department, queue and escalation.' },
]

/**
 * ILLUSTRATIVE SLA targets for the demo. These are configurable examples only —
 * they are NOT legal, official or municipal service standards.
 */
const BASE_HOURS: Record<Severity, [number, number, number]> = {
  critical: [4, 12, 48],
  high: [12, 24, 96],
  medium: [24, 72, 168],
  low: [48, 120, 336],
}
const CATEGORY_FACTOR: Record<IssueCategory, number> = { garbage: 1, drainage: 0.75, pothole: 1.5, other: 1.25 }

export const SLA_POLICIES: SlaPolicy[] = (['garbage', 'drainage', 'pothole', 'other'] as IssueCategory[]).flatMap((category) =>
  (Object.keys(BASE_HOURS) as Severity[]).map((severity) => {
    const [ack, action, resolution] = BASE_HOURS[severity]
    return {
      id: `sla-${category}-${severity}`,
      category,
      severity,
      acknowledgementHours: ack,
      actionHours: action,
      resolutionHours: Math.round(resolution * CATEGORY_FACTOR[category]),
      enabled: true,
    }
  }),
)

export function findSla(category: IssueCategory, severity: Severity): SlaPolicy {
  return SLA_POLICIES.find((p) => p.category === category && p.severity === severity) ?? SLA_POLICIES[0]
}

/**
 * API mode: replace the demo directory with the backend's departments and zones, so every component that
 * reads DEPARTMENTS / ZONES / getDepartment keeps working with real ids.
 */
export function hydrateDirectory(departments: Department[], zones: Zone[]): void {
  DEPARTMENTS.splice(0, DEPARTMENTS.length, ...departments)
  ZONES.splice(0, ZONES.length, ...zones)
  for (const c of Object.keys(CATEGORY_DEPARTMENT) as IssueCategory[]) {
    const d = departments.find((x) => x.active && x.categories.includes(c))
    if (d) CATEGORY_DEPARTMENT[c] = d.id
  }
}

/** API mode: names of colleagues/supervisors visible to the signed-in user (plus the user themself). */
export function setDirectoryUsers(users: UserProfile[]): void {
  USERS.splice(0, USERS.length, ...users)
}

export function getUser(id: string | null | undefined): UserProfile | undefined {
  return USERS.find((u) => u.id === id)
}

export function getDepartment(id: string | null | undefined): Department | undefined {
  return DEPARTMENTS.find((d) => d.id === id)
}

export function getZone(id: string | null | undefined): Zone | undefined {
  return ZONES.find((z) => z.id === id)
}

/** Nearest demo zone to a coordinate — a stand-in for real ward boundary lookup (Phase 2). */
export function nearestZone(lat: number, lng: number): Zone {
  let best = ZONES[0]
  let bestD = Infinity
  for (const z of ZONES) {
    const d = (z.center[0] - lat) ** 2 + (z.center[1] - lng) ** 2
    if (d < bestD) {
      bestD = d
      best = z
    }
  }
  return best
}
