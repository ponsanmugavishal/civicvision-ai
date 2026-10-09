import { LayoutDashboard, LogIn, Map, Menu, PlusCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Logo } from '@/components/Logo'
import { ButtonLink } from '@/components/ui/Button'
import { homePathFor, useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/cn'
import { isMockMode } from '@/config/env'
import { DemoBanner } from './DemoBanner'

const navCls = ({ isActive }: { isActive: boolean }) =>
  cn('rounded-md px-3 py-2 text-sm font-medium transition-colors', isActive ? 'text-brand-800 bg-brand-50' : 'text-ink-soft hover:text-ink hover:bg-slate-100')

export function PublicLayout() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])
  const reportHref = user?.role === 'citizen' ? '/citizen/report/new' : '/login?next=/citizen/report/new'

  return (
    <div className="flex min-h-dvh flex-col">
      {isMockMode && <DemoBanner />}
      <header className="sticky top-0 z-[1100] border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
            <NavLink to="/map" className={navCls}>
              Civic map
            </NavLink>
            <NavLink to="/track" className={navCls}>
              Track a complaint
            </NavLink>
            <Link to="/#how-it-works" className={navCls({ isActive: false })}>
              How it works
            </Link>
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            {user ? (
              <ButtonLink to={homePathFor(user)} variant="secondary" icon={<LayoutDashboard className="size-4" />}>
                My portal
              </ButtonLink>
            ) : (
              <ButtonLink to="/login" variant="ghost" icon={<LogIn className="size-4" />}>
                Sign in
              </ButtonLink>
            )}
            <ButtonLink to={reportHref} icon={<PlusCircle className="size-4" />}>
              Report an issue
            </ButtonLink>
          </div>
          <button type="button" className="ml-auto rounded-md p-2 text-ink-soft hover:bg-slate-100 md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label="Main" className="border-t border-line bg-surface px-4 py-3 md:hidden">
            <div className="flex flex-col gap-1">
              <NavLink to="/map" className={navCls}>
                <Map className="mr-2 inline size-4" aria-hidden />
                Civic map
              </NavLink>
              <NavLink to="/track" className={navCls}>
                Track a complaint
              </NavLink>
              <Link to="/#how-it-works" className={navCls({ isActive: false })}>
                How it works
              </Link>
              {user ? (
                <NavLink to={homePathFor(user)} className={navCls}>
                  My portal
                </NavLink>
              ) : (
                <NavLink to="/login" className={navCls}>
                  Sign in
                </NavLink>
              )}
              <ButtonLink to={reportHref} className="mt-2" icon={<PlusCircle className="size-4" />}>
                Report an issue
              </ButtonLink>
            </div>
          </nav>
        )}
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <Logo />
            <p className="mt-2 max-w-md text-xs">
              A hackathon prototype for transparent civic issue reporting. Independent project — not affiliated with, endorsed by, or operated for any government body.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/map" className="hover:text-ink">
              Civic map
            </Link>
            <Link to="/track" className="hover:text-ink">
              Track a complaint
            </Link>
            <Link to="/login" className="hover:text-ink">
              Sign in
            </Link>
            <Link to="/register" className="hover:text-ink">
              Create account
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
