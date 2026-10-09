import { ArrowLeft, ArrowRight, LogIn, Terminal } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { DemoTag } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Field'
import { env, isMockMode, supabaseConfigured } from '@/config/env'
import { useAuth } from '@/context/AuthContext'
import { DEMO_PERSONAS, getUser, USERS } from '@/data/directory'
import { ROLE_LABEL } from '@/lib/domain'
import { errorMessage } from '@/services'
import type { Role, UserProfile } from '@/types'
import { PORTALS, portalForRole, type Portal, type PortalId } from './portals'

/** Seeded accounts from `python -m app.seed --dev` (local development only). */
const DEV_ACCOUNTS: { email: string; name: string; role: Role; blurb: string }[] = [
  { email: 'asha@dev.civicvision.local', name: 'Asha Raman', role: 'citizen', blurb: 'Citizen' },
  { email: 'karthik@dev.civicvision.local', name: 'Karthik Natarajan', role: 'staff', blurb: 'Solid Waste — North & Central' },
  { email: 'rahul@dev.civicvision.local', name: 'Rahul Menon', role: 'staff', blurb: 'Drains — all zones' },
  { email: 'arun@dev.civicvision.local', name: 'Arun Balaji', role: 'staff', blurb: 'Roads — all zones' },
  { email: 'lakshmi@dev.civicvision.local', name: 'Lakshmi Iyer', role: 'supervisor', blurb: 'All departments and zones' },
]

function safeNext(next: string | null, portal: Portal): string {
  return next && next.startsWith(portal.home) ? next : portal.home
}

function wrongPortal(user: UserProfile, portal: Portal): string {
  const right = portalForRole(user.role)
  return `This is a ${ROLE_LABEL[user.role].toLowerCase()} account, so it can't use the ${portal.label} login. Please use the ${right.label} login instead.`
}

function PersonaButton({ name, role, blurb, onClick, busy }: { name: string; role: Role; blurb: string; onClick: () => void; busy?: boolean }) {
  const Icon = portalForRole(role).icon
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="group flex w-full items-center gap-4 rounded-xl border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-60"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">
          {name} <span className="font-normal text-ink-muted">· {ROLE_LABEL[role]}</span>
        </span>
        <span className="block text-sm text-ink-soft">{blurb}</span>
      </span>
      <ArrowRight className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  )
}

export default function PortalLogin() {
  const { portal: portalId } = useParams()
  const portal = PORTALS[portalId as PortalId]
  const { signInDemo, signInPassword, signInDev, signOut, user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [pending, setPending] = useState(false)

  if (!portal) return <Navigate to="/login" replace />
  // Already signed in with a matching account → straight to the portal.
  if (user && portal.roles.includes(user.role)) return <Navigate to={safeNext(next, portal)} replace />

  const admit = async (u: UserProfile) => {
    if (!portal.roles.includes(u.role)) {
      await signOut()
      setErrors({ form: wrongPortal(u, portal) })
      return
    }
    navigate(safeNext(next, portal), { replace: true })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter a valid email address.'
    if (!password) errs.password = 'Enter your password.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    if (isMockMode) {
      const u = USERS.find((x) => x.email?.toLowerCase() === email.trim().toLowerCase())
      if (!u) return setErrors({ form: 'No demo account uses that email.' })
      if (!portal.roles.includes(u.role)) return setErrors({ form: wrongPortal(u, portal) })
      signInDemo(u.id)
      return navigate(safeNext(next, portal), { replace: true })
    }
    setPending(true)
    try {
      await admit(await signInPassword(email.trim(), password))
    } catch (err) {
      setErrors({ form: errorMessage(err) })
    } finally {
      setPending(false)
    }
  }

  const devSignIn = async (address: string) => {
    setPending(true)
    try {
      await admit(await signInDev(address))
    } catch (err) {
      setErrors({ form: errorMessage(err) })
    } finally {
      setPending(false)
    }
  }

  const personas = DEMO_PERSONAS.map((p) => ({ p, u: getUser(p.userId)! })).filter(({ u }) => portal.roles.includes(u.role))
  const devAccounts = DEV_ACCOUNTS.filter((a) => portal.roles.includes(a.role))
  const showForm = isMockMode || supabaseConfigured

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <Link to="/login" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All logins
      </Link>
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <portal.icon className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{portal.title}</h1>
          <p className="text-sm text-ink-muted">{portal.description}</p>
        </div>
      </div>

      {next && <Alert className="mt-5">Please sign in to continue.</Alert>}

      {showForm ? (
        <Card className="mt-6">
          <CardBody className="p-6">
            <form onSubmit={submit} noValidate className="space-y-4">
              {errors.form && <Alert tone="error">{errors.form}</Alert>}
              <Field label="Email" error={errors.email} required>
                {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.org" />}
              </Field>
              <Field label="Password" error={errors.password} required hint={isMockMode ? 'Demo mode: passwords are not verified or stored.' : undefined}>
                {(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
              </Field>
              <Button type="submit" className="w-full" loading={pending} icon={<LogIn className="size-4" />}>
                Sign in to {portal.label}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : (
        <Alert tone="warning" className="mt-6" title="Sign-in is not configured">
          Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable sign-in.
          {errors.form && <span className="mt-1 block font-medium">{errors.form}</span>}
        </Alert>
      )}

      {portal.canRegister ? (
        <p className="mt-4 text-sm text-ink-muted">
          New here?{' '}
          <Link to="/register" className="font-medium text-brand-700 hover:underline">
            Create a citizen account
          </Link>
        </p>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">
          {portal.label} accounts are created by an administrator. If you need access, contact your department's administrator.
        </p>
      )}

      {isMockMode && personas.length > 0 && (
        <div className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            Or explore as a demo persona <DemoTag />
          </h2>
          <ul className="mt-3 space-y-3">
            {personas.map(({ p, u }) => (
              <li key={u.id}>
                <PersonaButton
                  name={u.displayName}
                  role={u.role}
                  blurb={p.blurb}
                  onClick={() => {
                    signInDemo(u.id)
                    navigate(safeNext(next, portal), { replace: true })
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isMockMode && env.devLogin && devAccounts.length > 0 && (
        <div className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Terminal className="size-4 text-ink-muted" aria-hidden />
            Local development accounts
          </h2>
          <ul className="mt-3 space-y-3">
            {devAccounts.map((a) => (
              <li key={a.email}>
                <PersonaButton name={a.name} role={a.role} blurb={a.blurb} busy={pending} onClick={() => void devSignIn(a.email)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
