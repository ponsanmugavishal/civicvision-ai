import { CheckCircle2, Clock, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Feedback'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field'
import { isMockMode, supabaseConfigured } from '@/config/env'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { DEPARTMENTS } from '@/data/directory'
import { useMutation } from '@/hooks/useApi'
import { cn } from '@/lib/cn'
import { api, errorMessage } from '@/services'
import { PORTALS, type PortalId } from './portals'

const ACCOUNT_TYPES: PortalId[] = ['citizen', 'authority', 'official']

export default function Register() {
  const { signInDemo, signUp } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialType = ACCOUNT_TYPES.includes(params.get('type') as PortalId) ? (params.get('type') as PortalId) : 'citizen'
  const [type, setType] = useState<PortalId>(initialType)
  const [form, setForm] = useState({ displayName: '', email: '', password: '', confirm: '', agree: false, departmentId: '', note: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [apiPending, setApiPending] = useState(false)
  const [requested, setRequested] = useState<PortalId | null>(null)
  const register = useMutation(api.auth.registerDemoCitizen)

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))
  const official = type !== 'citizen'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (form.displayName.trim().length < 2) errs.displayName = 'Enter your name (at least 2 characters).'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Enter a valid email address.'
    if (form.password.length < 8 || form.password.toLowerCase() === form.password || !/\d/.test(form.password)) errs.password = 'Use at least 8 characters, including a capital letter and a number.'
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match.'
    if (type === 'authority' && !form.departmentId) errs.departmentId = 'Choose the department you work in.'
    if (official && form.note.trim().length < 5) errs.note = 'Tell the administrator who you are (e.g. designation and employee ID).'
    if (!form.agree) errs.agree = isMockMode ? 'Please confirm you understand this is a demo account.' : 'Please accept to continue.'
    setErrors(errs)
    if (Object.keys(errs).length) return

    if (isMockMode) {
      if (official) return setApiError('Official access requests are not available in demo mode.')
      const user = await register.run({ displayName: form.displayName, email: form.email })
      if (user) {
        signInDemo(user.id)
        toast({ tone: 'success', title: 'Demo citizen account created', body: 'Stored in this browser only.' })
        navigate('/citizen', { replace: true })
      }
      return
    }
    setApiPending(true)
    setApiError(null)
    try {
      await signUp(
        form.displayName.trim(),
        form.email.trim(),
        form.password,
        official ? { requestedRole: type === 'authority' ? 'staff' : 'supervisor', departmentId: form.departmentId || null, note: form.note.trim() } : undefined,
      )
      if (official) setRequested(type)
      else {
        toast({ tone: 'success', title: 'Account created' })
        navigate('/citizen', { replace: true })
      }
    } catch (err) {
      setApiError(errorMessage(err))
    } finally {
      setApiPending(false)
    }
  }

  if (requested) {
    const p = PORTALS[requested]
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <span className="inline-flex rounded-full bg-orange-50 p-3 text-orange-600">
          <Clock className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Request sent to the administrator</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Your account is created. Your <strong>{p.label}</strong> access is waiting for an administrator to approve it. You'll get a notification when it's decided, and
          then you can sign in through the <strong>{p.label} login</strong>.
        </p>
        <p className="mt-2 text-sm text-ink-muted">Meanwhile you can already use the public side: report issues and follow complaints.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <ButtonLink to="/citizen" icon={<CheckCircle2 className="size-4" />}>
            Continue to the public portal
          </ButtonLink>
        </div>
      </div>
    )
  }

  const fe = { ...register.fieldErrors, ...errors }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>

      <fieldset className="mt-6">
        <legend className="mb-2 text-sm font-medium text-ink">Account type</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {ACCOUNT_TYPES.map((id) => {
            const p = PORTALS[id]
            const active = type === id
            return (
              <label
                key={id}
                className={cn(
                  'flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600',
                  active ? 'border-brand-600 bg-brand-50/60 ring-1 ring-brand-600' : 'border-line bg-surface hover:bg-canvas',
                )}
              >
                <input type="radio" name="accountType" value={id} checked={active} onChange={() => setType(id)} className="sr-only" />
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <p.icon className="size-5 text-brand-700" aria-hidden />
                  {p.label}
                </span>
                <span className="text-xs text-ink-soft">{id === 'citizen' ? 'Ready immediately.' : 'Needs administrator approval.'}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {official && (
        <Alert tone="info" className="mt-4" title={`${PORTALS[type].label} access is approved by an administrator`}>
          Your account is created now as a public account. The administrator checks your details and grants {PORTALS[type].label} access — nobody can give themselves
          official powers.
        </Alert>
      )}

      <Card className="mt-4">
        <CardBody className="p-6">
          <form onSubmit={submit} noValidate className="space-y-4">
            {!isMockMode && !supabaseConfigured && <Alert tone="warning">Sign-up needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to be configured.</Alert>}
            {apiError && <Alert tone="error">{apiError}</Alert>}
            {register.error && !Object.keys(register.fieldErrors).length && <Alert tone="error">{register.error}</Alert>}
            <Field label="Full name" error={fe.displayName} required>
              {(p) => <Input {...p} autoComplete="name" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} />}
            </Field>
            <Field label="Email" error={fe.email} required>
              {(p) => <Input {...p} type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Password" error={fe.password} required hint="8+ characters with a capital letter and a number.">
                {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} />}
              </Field>
              <Field label="Confirm password" error={fe.confirm} required>
                {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} />}
              </Field>
            </div>
            {type === 'authority' && (
              <Field label="Your department" required error={fe.departmentId}>
                {(p) => (
                  <Select {...p} value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                    <option value="">Choose a department…</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            {official && (
              <Field label="Details for the administrator" required error={fe.note} hint="Designation, office/zone and employee ID, so the administrator can verify you.">
                {(p) => <Textarea {...p} rows={3} maxLength={500} value={form.note} onChange={(e) => set('note', e.target.value)} />}
              </Field>
            )}
            <div>
              <Checkbox
                checked={form.agree}
                onChange={(e) => set('agree', e.target.checked)}
                label={isMockMode ? 'I understand this is a demo account stored only in this browser.' : 'I agree that reports, photos and locations I submit are shown publicly without my name or contact details.'}
              />
              {fe.agree && <p className="mt-1 text-sm text-red-600">{fe.agree}</p>}
            </div>
            <Button type="submit" className="w-full" loading={register.pending || apiPending} icon={<UserPlus className="size-4" />}>
              {official ? `Create account & request ${PORTALS[type].label} access` : 'Create account'}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
