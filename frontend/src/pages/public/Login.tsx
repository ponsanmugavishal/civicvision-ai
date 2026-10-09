import { ArrowRight, Building2, Landmark, LogIn, Terminal, User } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { DemoTag } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Field'
import { env, isMockMode, supabaseConfigured } from '@/config/env'
import { homePathFor, useAuth } from '@/context/AuthContext'
import { DEMO_PERSONAS, getUser, USERS } from '@/data/directory'
import { ROLE_LABEL } from '@/lib/domain'
import { errorMessage } from '@/services'
import type { Role, UserProfile } from '@/types'

function safeNext(next: string | null, user: UserProfile): string {
  const home = homePathFor(user)
  if (!next || !next.startsWith('/') || next.startsWith('//')) return home
  const area = next.split('/')[1]
  const allowed = user.role === 'citizen' ? 'citizen' : user.role === 'staff' ? 'staff' : 'supervisor'
  return ['citizen', 'staff', 'supervisor'].includes(area) && area !== allowed ? home : next
}

/** Seeded accounts from `python -m app.seed --dev` (local development only). */
const DEV_ACCOUNTS: { email: string; name: string; role: Role; blurb: string }[] = [
  { email: 'asha@dev.civicvision.local', name: 'Asha Raman', role: 'citizen', blurb: 'Citizen' },
  { email: 'karthik@dev.civicvision.local', name: 'Karthik Natarajan', role: 'staff', blurb: 'Solid Waste — North & Central' },
  { email: 'rahul@dev.civicvision.local', name: 'Rahul Menon', role: 'staff', blurb: 'Drains — all zones' },
  { email: 'arun@dev.civicvision.local', name: 'Arun Balaji', role: 'staff', blurb: 'Roads — all zones' },
  { email: 'lakshmi@dev.civicvision.local', name: 'Lakshmi Iyer', role: 'supervisor', blurb: 'All departments and zones' },
]

const roleIcon = (role: Role) => (role === 'citizen' ? User : role === 'staff' ? Building2 : Landmark)

function PersonaButton({ name, role, blurb, onClick, busy }: { name: string; role: Role; blurb: string; onClick: () => void; busy?: boolean }) {
  const Icon = roleIcon(role)
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

export default function Login() {
  const { signInDemo, signInPassword, signInDev } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [pending, setPending] = useState(false)

  const go = (user: UserProfile) => navigate(safeNext(next, user), { replace: true })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter a valid email address.'
    if (!password) errs.password = 'Enter your password.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    if (isMockMode) {
      const user = USERS.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase())
      if (!user) return setErrors({ form: 'No demo account uses that email. Pick a demo persona or create a demo citizen account.' })
      signInDemo(user.id)
      return go(user)
    }
    setPending(true)
    try {
      go(await signInPassword(email.trim(), password))
    } catch (err) {
      setErrors({ form: errorMessage(err) })
    } finally {
      setPending(false)
    }
  }

  const devSignIn = async (address: string) => {
    setPending(true)
    try {
      go(await signInDev(address))
    } catch (err) {
      setErrors({ form: errorMessage(err) })
    } finally {
      setPending(false)
    }
  }

  const showPasswordForm = isMockMode || supabaseConfigured

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">
          New here?{' '}
          <Link to="/register" className="font-medium text-brand-700 hover:underline">
            Create a citizen account
          </Link>
        </p>
        {next && <Alert className="mt-4">Please sign in to continue.</Alert>}
        {showPasswordForm ? (
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
                  Sign in
                </Button>
              </form>
            </CardBody>
          </Card>
        ) : (
          <Alert tone="warning" className="mt-6" title="Sign-in is not configured">
            Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable email sign-in.
            {errors.form && <span className="mt-1 block font-medium">{errors.form}</span>}
          </Alert>
        )}
        {isMockMode && (
          <Alert tone="warning" className="mt-4" title="Demo authentication">
            In demo mode accounts exist only in this browser and roles come from fictional demo profiles.
          </Alert>
        )}
        {!isMockMode && (
          <p className="mt-4 text-xs text-ink-muted">
            Every new account is a citizen account. Staff and supervisor access is granted by an administrator — it cannot be selected here.
          </p>
        )}
      </div>

      {isMockMode && (
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            Explore as a demo persona <DemoTag />
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Each persona has a fixed, pre-provisioned role and scope. Users can never pick or change their own role in the real system.</p>
          <ul className="mt-4 space-y-3">
            {DEMO_PERSONAS.map((p) => {
              const u = getUser(p.userId)!
              return (
                <li key={u.id}>
                  <PersonaButton
                    name={u.displayName}
                    role={u.role}
                    blurb={p.blurb}
                    onClick={() => {
                      signInDemo(u.id)
                      go(u)
                    }}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {!isMockMode && env.devLogin && (
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Terminal className="size-5 text-ink-muted" aria-hidden />
            Local development accounts
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Only available when the backend runs with DEV_LOGIN_ENABLED=true (never in production). Accounts are created by <code>python -m app.seed --dev</code>.
          </p>
          <ul className="mt-4 space-y-3">
            {DEV_ACCOUNTS.map((a) => (
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
