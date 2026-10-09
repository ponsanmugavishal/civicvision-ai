import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router'
import { LoadingBlock } from '@/components/ui/Feedback'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import { PortalLayout } from '@/layouts/PortalLayout'
import { PublicLayout } from '@/layouts/PublicLayout'
import { RequireRole } from '@/layouts/RequireRole'
import { RouteError } from '@/pages/public/RouteError'

function page(loader: () => Promise<{ default: ComponentType }>) {
  const Comp = lazy(loader)
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl p-6">
          <LoadingBlock rows={5} label="Loading page" />
        </div>
      }
    >
      <Comp />
    </Suspense>
  )
}

function Root() {
  return (
    <>
      <a href="#main" className="sr-only z-[3000] rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: page(() => import('@/pages/public/Landing')) },
          { path: 'map', element: page(() => import('@/pages/public/MapExplorer')) },
          { path: 'reports/:id', element: page(() => import('@/pages/public/PublicReportDetail')) },
          { path: 'track', element: page(() => import('@/pages/public/TrackComplaint')) },
          { path: 'login', element: page(() => import('@/pages/public/Login')) },
          { path: 'login/:portal', element: page(() => import('@/pages/public/PortalLogin')) },
          { path: 'register', element: page(() => import('@/pages/public/Register')) },
          { path: '*', element: page(() => import('@/pages/public/NotFound')) },
        ],
      },
      {
        path: 'citizen',
        element: (
          <RequireRole roles={['citizen']}>
            <PortalLayout />
          </RequireRole>
        ),
        children: [
          { index: true, element: page(() => import('@/pages/citizen/CitizenDashboard')) },
          { path: 'report/new', element: page(() => import('@/pages/citizen/NewReport')) },
          { path: 'reports', element: page(() => import('@/pages/citizen/MyReports')) },
          { path: 'reports/:id', element: page(() => import('@/pages/citizen/CitizenReportDetail')) },
        ],
      },
      {
        path: 'staff',
        element: (
          <RequireRole roles={['staff']}>
            <PortalLayout />
          </RequireRole>
        ),
        children: [
          { index: true, element: page(() => import('@/pages/staff/StaffDashboard')) },
          { path: 'queue', element: page(() => import('@/pages/staff/StaffQueue')) },
          { path: 'map', element: page(() => import('@/pages/staff/StaffMap')) },
          { path: 'reports/:id', element: page(() => import('@/pages/staff/WorkReportDetail')) },
        ],
      },
      {
        path: 'supervisor',
        element: (
          <RequireRole roles={['supervisor', 'administrator']}>
            <PortalLayout />
          </RequireRole>
        ),
        children: [
          { index: true, element: page(() => import('@/pages/supervisor/SupervisorOverview')) },
          { path: 'queues', element: page(() => import('@/pages/supervisor/ActionQueues')) },
          { path: 'escalations', element: page(() => import('@/pages/supervisor/Escalations')) },
          { path: 'extensions', element: page(() => import('@/pages/supervisor/ExtensionsDisputes')) },
          { path: 'performance', element: page(() => import('@/pages/supervisor/Performance')) },
          { path: 'complaints', element: page(() => import('@/pages/supervisor/AllComplaints')) },
          { path: 'audit', element: page(() => import('@/pages/supervisor/AuditTrail')) },
          {
            path: 'users',
            element: <RequireRole roles={['administrator']}>{page(() => import('@/pages/supervisor/UserManagement'))}</RequireRole>,
          },
          { path: 'reports/:id', element: page(() => import('@/pages/staff/WorkReportDetail')) },
        ],
      },
    ],
  },
])

/** API mode: wait for the directory and any existing session before rendering routes. */
function AuthGate() {
  const { ready, bootError } = useAuth()
  if (!ready) {
    return (
      <div className="mx-auto max-w-md p-10">
        <LoadingBlock rows={3} label="Connecting to the server" />
      </div>
    )
  }
  if (bootError) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Can't reach the CIVICVISION server</h1>
        <p className="text-sm text-ink-muted">{bootError}</p>
        <p className="text-xs text-ink-muted">Check that the backend is running and that VITE_API_BASE_URL and CORS_ORIGINS are configured.</p>
        <button type="button" onClick={() => window.location.reload()} className="mx-auto rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
          Retry
        </button>
      </div>
    )
  }
  return <RouterProvider router={router} />
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ToastProvider>
  )
}
