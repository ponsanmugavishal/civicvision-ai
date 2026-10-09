import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { PORTALS, portalForPath, type PortalId } from './portals'

/** Sign-in chooser: three separate logins for citizens, department authorities and higher officials. */
export default function Login() {
  const [params] = useSearchParams()
  const next = params.get('next')
  const target = portalForPath(next)
  if (target) return <Navigate to={`/login/${target}?next=${encodeURIComponent(next!)}`} replace />

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-ink-muted">Choose how you use CIVICVISION AI.</p>
      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {(Object.keys(PORTALS) as PortalId[]).map((id) => {
          const p = PORTALS[id]
          return (
            <li key={id}>
              <Link
                to={`/login/${id}`}
                className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-6 shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/40"
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <p.icon className="size-6" aria-hidden />
                </span>
                <span className="mt-4 text-lg font-semibold text-ink">{p.label}</span>
                <span className="mt-1 flex-1 text-sm text-ink-soft">{p.description}</span>
                <span className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-medium text-white group-hover:bg-brand-800">
                  {p.label} login <ArrowRight className="size-4" aria-hidden />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="mt-6 flex items-start gap-2 text-sm text-ink-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Anyone can create a citizen account. Authority and Higher Official accounts are created by an administrator — roles can never be chosen at sign-up.
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        New citizen?{' '}
        <Link to="/register" className="font-medium text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  )
}
