import {
  BarChart3,
  ClipboardList,
  FileClock,
  Gauge,
  Globe,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Map,
  Menu,
  PlusCircle,
  ScrollText,
  UserCog,
  ShieldAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Logo } from '@/components/Logo'
import { DemoTag } from '@/components/ui/Badge'
import { useCurrentUser, useAuth } from '@/context/AuthContext'
import { getDepartment, getZone } from '@/data/directory'
import { cn } from '@/lib/cn'
import { ROLE_LABEL } from '@/lib/domain'
import type { Role } from '@/types'
import { isMockMode } from '@/config/env'
import { DemoBanner } from './DemoBanner'
import { NotificationBell } from './NotificationBell'
import { useLiveStatus } from '@/lib/live'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV: Record<'citizen' | 'staff' | 'supervisor', NavItem[]> = {
  citizen: [
    { to: '/citizen', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/citizen/report/new', label: 'Report an issue', icon: PlusCircle },
    { to: '/citizen/reports', label: 'My reports', icon: ClipboardList },
    { to: '/map', label: 'Public civic map', icon: Globe },
  ],
  staff: [
    { to: '/staff', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/staff/queue', label: 'Work queue', icon: ListChecks },
    { to: '/staff/map', label: 'Assignment map', icon: Map },
  ],
  supervisor: [
    { to: '/supervisor', label: 'Overview', icon: Gauge, end: true },
    { to: '/supervisor/queues', label: 'Action queues', icon: ShieldAlert },
    { to: '/supervisor/escalations', label: 'Escalations', icon: History },
    { to: '/supervisor/extensions', label: 'Extensions & disputes', icon: FileClock },
    { to: '/supervisor/performance', label: 'Performance & hotspots', icon: BarChart3 },
    { to: '/supervisor/complaints', label: 'All complaints', icon: ClipboardList },
    { to: '/supervisor/audit', label: 'Audit trail', icon: ScrollText },
  ],
}

function navFor(role: Role) {
  if (role === 'administrator') return [...NAV.supervisor, { to: '/supervisor/users', label: 'User management', icon: UserCog }]
  return role === 'citizen' ? NAV.citizen : role === 'staff' ? NAV.staff : NAV.supervisor
}

export function PortalLayout() {
  const user = useCurrentUser()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)
  const live = useLiveStatus()
  useEffect(() => setDrawer(false), [location.pathname])

  const zoneLabel = user.allZones || (isMockMode && user.zoneIds.length === 0) ? 'All zones' : user.zoneIds.map((z) => getZone(z)?.name.replace(' Zone', '')).join(', ') || 'No zones assigned'
  const scope =
    user.role === 'staff'
      ? `${getDepartment(user.departmentId)?.shortName ?? ''} · ${zoneLabel}`
      : user.role !== 'citizen'
        ? `${getDepartment(user.departmentId)?.shortName ?? 'All departments'} · ${zoneLabel}`
        : 'Citizen account'

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-line px-5">
        <Logo subtitle={`${ROLE_LABEL[user.role]} portal`} />
      </div>
      <nav aria-label="Portal" className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {navFor(user.role).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-soft hover:bg-slate-100 hover:text-ink')
            }
          >
            <item.icon className="size-4.5 shrink-0" aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <div className="rounded-lg bg-canvas p-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800" aria-hidden>
              {user.displayName
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                {user.displayName} <DemoTag />
              </p>
              <p className="truncate text-xs text-ink-muted">{user.title ?? ROLE_LABEL[user.role]}</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-muted">Scope: {scope}</p>
          <button
            type="button"
            onClick={() => {
              void signOut().then(() => navigate('/'))
            }}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-soft hover:text-ink"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-dvh flex-col">
      {isMockMode && <DemoBanner />}
      <div className="flex flex-1">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-line bg-surface lg:block">{sidebar}</aside>
        {drawer && (
          <div className="fixed inset-0 z-[1500] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close navigation" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-pop">
              <button type="button" className="absolute top-4 right-3 rounded-md p-1.5 text-ink-muted hover:bg-slate-100" onClick={() => setDrawer(false)} aria-label="Close navigation">
                <X className="size-5" />
              </button>
              {sidebar}
            </aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-[1100] flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
            <button type="button" className="rounded-md p-2 text-ink-soft hover:bg-slate-100 lg:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation">
              <Menu className="size-5" />
            </button>
            <p className="truncate text-sm text-ink-muted">
              <span className="font-medium text-ink">{ROLE_LABEL[user.role]} portal</span>
              <span className="hidden sm:inline"> · {scope}</span>
            </p>
            <div className="ml-auto flex items-center gap-2">
              {live !== 'off' && (
                <span className="hidden items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted sm:inline-flex" title={live === 'live' ? 'Connected to realtime updates' : 'Refreshing automatically every 30 seconds'}>
                  <span className={cn('size-2 rounded-full', live === 'live' ? 'bg-green-500' : 'bg-slate-400')} aria-hidden />
                  {live === 'live' ? 'Live' : 'Auto-refresh'}
                </span>
              )}
              <NotificationBell />
            </div>
          </header>
          <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
