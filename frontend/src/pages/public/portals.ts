import { Building2, Landmark, User, type LucideIcon } from 'lucide-react'
import type { Role } from '@/types'

export type PortalId = 'citizen' | 'authority' | 'official'

export interface Portal {
  id: PortalId
  roles: Role[]
  label: string
  title: string
  description: string
  icon: LucideIcon
  canRegister: boolean
  home: string
}

/** The three separate sign-in entry points. Each only admits accounts with matching (server-assigned) roles. */
export const PORTALS: Record<PortalId, Portal> = {
  citizen: {
    id: 'citizen',
    roles: ['citizen'],
    label: 'Public / Citizen',
    title: 'Citizen sign in',
    description: 'Report garbage, drainage and road problems, track your complaints and rate the fix.',
    icon: User,
    canRegister: true,
    home: '/citizen',
  },
  authority: {
    id: 'authority',
    roles: ['staff'],
    label: 'Department Authority',
    title: 'Department Authority sign in',
    description: 'For department staff responsible for resolving complaints in their zones.',
    icon: Building2,
    canRegister: false,
    home: '/staff',
  },
  official: {
    id: 'official',
    roles: ['supervisor', 'administrator'],
    label: 'Higher Officials',
    title: 'Higher Officials sign in',
    description: 'For supervisors and administrators overseeing departments, deadlines, escalations and accounts.',
    icon: Landmark,
    canRegister: false,
    home: '/supervisor',
  },
}

export function portalForRole(role: Role): Portal {
  return role === 'citizen' ? PORTALS.citizen : role === 'staff' ? PORTALS.authority : PORTALS.official
}

/** Which portal a protected path belongs to (used to send signed-out users to the right login). */
export function portalForPath(path: string | null): PortalId | null {
  if (!path) return null
  if (path.startsWith('/citizen')) return 'citizen'
  if (path.startsWith('/staff')) return 'authority'
  if (path.startsWith('/supervisor')) return 'official'
  return null
}
