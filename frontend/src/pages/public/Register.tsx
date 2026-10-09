import { MailCheck, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Feedback'
import { Checkbox, Field, Input } from '@/components/ui/Field'
import { isMockMode, supabaseConfigured } from '@/config/env'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useMutation } from '@/hooks/useApi'
import { api, errorMessage } from '@/services'

export default function Register() {
  const { signInDemo, signUp } = useAuth()
  const [apiError, setApiError] = useState<string | null>(null)
  const [apiPending, setApiPending] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null)
  const { toast } = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ displayName: '', email: '', password: '', confirm: '', agree: false })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const register = useMutation(api.auth.registerDemoCitizen)

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (form.displayName.trim().length < 2) errs.displayName = 'Enter your name (at least 2 characters).'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Enter a valid email address.'
    if (form.password.length < 8 || form.password.toLowerCase() === form.password || !/\d/.test(form.password)) errs.password = 'Use at least 8 characters, including a capital letter and a number.'
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match.'
    if (!form.agree) errs.agree = isMockMode ? 'Please confirm you understand this is a demo account.' : 'Please accept to continue.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    if (!isMockMode) {
      setApiPending(true)
      setApiError(null)
      try {
        const res = await signUp(form.displayName.trim(), form.email.trim(), form.password)
        if (res.needsConfirmation) setConfirmEmail(form.email.trim())
        else {
          toast({ tone: 'success', title: 'Account created' })
          navigate('/citizen', { replace: true })
        }
      } catch (err) {
        setApiError(errorMessage(err))
      } finally {
        setApiPending(false)
      }
      return
    }
    const user = await register.run({ displayName: form.displayName, email: form.email })
    if (user) {
      signInDemo(user.id)
      toast({ tone: 'success', title: 'Demo citizen account created', body: 'Stored in this browser only.' })
      navigate('/citizen', { replace: true })
    }
  }

  const fe = { ...register.fieldErrors, ...errors }

  if (confirmEmail) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <span className="inline-flex rounded-full bg-brand-50 p-3 text-brand-700">
          <MailCheck className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm text-ink-muted">We sent a confirmation link to {confirmEmail}. Open it, then sign in.</p>
        <Link to="/login" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
          Go to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Create a citizen account</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Already registered?{' '}
        <Link to="/login/citizen" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
      <Card className="mt-6">
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
              <Field label="Password" error={fe.password} required>
                {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} />}
              </Field>
              <Field label="Confirm password" error={fe.confirm} required>
                {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} />}
              </Field>
            </div>
            <div>
              <Checkbox checked={form.agree} onChange={(e) => set('agree', e.target.checked)} label={isMockMode ? 'I understand this is a demo account stored only in this browser.' : 'I agree that my reports, photos and locations are shown publicly without my name or contact details.'} />
              {fe.agree && <p className="mt-1 text-sm text-red-600">{fe.agree}</p>}
            </div>
            <Button type="submit" className="w-full" loading={register.pending || apiPending} icon={<UserPlus className="size-4" />}>
              Create account
            </Button>
          </form>
        </CardBody>
      </Card>
      {isMockMode ? (
      <Alert tone="warning" className="mt-4" title="Demo mode">
        Your name and email are kept in this browser's local storage; the password is not stored or checked. Self-registration always creates a <strong>citizen</strong> account —
        staff and supervisor roles are provisioned by administrators only.
      </Alert>
      ) : (
        <p className="mt-4 text-xs text-ink-muted">Self-registration always creates a citizen account. Staff and supervisor roles are granted by administrators only.</p>
      )}
    </div>
  )
}
