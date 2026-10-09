import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { homePathFor, useAuth } from '@/context/AuthContext'
import { portalForPath } from '@/pages/public/portals'
import type { Role } from '@/types'

/**
 * Client-side route guard for navigation convenience ONLY.
 * Real authorisation is enforced by the backend and Supabase RLS from Phase 2 onward.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) {
    const next = location.pathname + location.search
    const portal = portalForPath(location.pathname)
    return <Navigate to={`/login${portal ? `/${portal}` : ''}?next=${encodeURIComponent(next)}`} replace />
  }
  if (!roles.includes(user.role)) return <Navigate to={homePathFor(user)} replace state={{ denied: location.pathname }} />
  return <>{children}</>
}
