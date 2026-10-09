import { Check, Inbox, KeyRound, Pencil, Search, UserPlus, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Alert, EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field'
import { PageHeader, Tabs } from '@/components/ui/Layout'
import { useCurrentUser } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { DEPARTMENTS, ZONES, getDepartment, getZone } from '@/data/directory'
import { useApi, useMutation } from '@/hooks/useApi'
import { ROLE_LABEL, type Tone } from '@/lib/domain'
import { formatDateTime } from '@/lib/format'
import { api } from '@/services'
import type { AccessRequest, AdminUserInput } from '@/services'
import type { Role, UserProfile } from '@/types'

const ROLE_TONE: Record<Role, Tone> = { citizen: 'slate', staff: 'blue', supervisor: 'violet', administrator: 'red' }
type View = 'all' | 'authority' | 'official' | 'citizen'

function tempPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  const core = Array.from(bytes, (b) => chars[b % chars.length]).join('')
  return `${core}A7` // always contains a capital letter and a digit
}

function scopeText(u: UserProfile): string {
  const dept = u.departmentId ? (getDepartment(u.departmentId)?.shortName ?? 'Department') : u.role === 'citizen' ? '' : 'All departments'
  const zones = u.role === 'citizen' ? '' : u.allZones ? 'All zones' : u.zoneIds.map((z) => getZone(z)?.name.replace(' Zone', '')).join(', ') || 'No zones'
  return [dept, zones].filter(Boolean).join(' · ')
}

/** Role, department and zone fields shared by the create and edit dialogs. */
function ScopeFields({ value, onChange, errors, allowCitizen }: { value: AdminUserInput; onChange: (v: AdminUserInput) => void; errors: Record<string, string>; allowCitizen: boolean }) {
  const set = (patch: Partial<AdminUserInput>) => onChange({ ...value, ...patch })
  const needsScope = value.role === 'staff' || value.role === 'supervisor'
  return (
    <div className="space-y-4">
      <Field label="Role" required error={errors.role}>
        {(p) => (
          <Select {...p} value={value.role} onChange={(e) => set({ role: e.target.value as Role })}>
            <option value="staff">Department Authority (staff)</option>
            <option value="supervisor">Higher Official (supervisor)</option>
            <option value="administrator">Higher Official (administrator — manages accounts)</option>
            {allowCitizen && <option value="citizen">Citizen (remove official access)</option>}
          </Select>
        )}
      </Field>
      {needsScope && (
        <Field label="Department" required={value.role === 'staff'} error={errors.departmentId} hint={value.role === 'supervisor' ? 'Leave as "All departments" to oversee every department.' : undefined}>
          {(p) => (
            <Select {...p} value={value.departmentId ?? ''} onChange={(e) => set({ departmentId: e.target.value || null })}>
              <option value="">{value.role === 'staff' ? 'Choose a department…' : 'All departments'}</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {needsScope && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">
            Zones<span className="ml-0.5 text-red-600">*</span>
          </legend>
          <Checkbox label="All zones" checked={value.allZones} onChange={(e) => set({ allZones: e.target.checked, zoneIds: e.target.checked ? [] : value.zoneIds })} />
          {!value.allZones && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ZONES.map((z) => (
                <Checkbox
                  key={z.id}
                  label={z.name}
                  checked={value.zoneIds.includes(z.id)}
                  onChange={(e) => set({ zoneIds: e.target.checked ? [...value.zoneIds, z.id] : value.zoneIds.filter((x) => x !== z.id) })}
                />
              ))}
            </div>
          )}
          {errors.zoneIds && <p className="mt-1 text-sm text-red-600">{errors.zoneIds}</p>}
        </fieldset>
      )}
      <Field label="Job title" hint="Optional, e.g. Assistant Engineer (Roads)">
        {(p) => <Input {...p} value={value.title ?? ''} maxLength={120} onChange={(e) => set({ title: e.target.value })} />}
      </Field>
    </div>
  )
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useCurrentUser()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(tempPassword)
  const [scope, setScope] = useState<AdminUserInput>({ role: 'staff', departmentId: null, zoneIds: [], allZones: false, title: '' })
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)
  const create = useMutation(api.admin.createUser)

  const close = () => {
    setCreated(null)
    setName('')
    setEmail('')
    setPassword(tempPassword())
    create.reset()
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={created ? 'Account created' : 'Create an Authority / Official account'}
      description={created ? undefined : 'The account is ready to use immediately — no email is sent. Share the sign-in details with the person privately.'}
      size="lg"
      footer={
        created ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              loading={create.pending}
              icon={<UserPlus className="size-4" />}
              onClick={async () => {
                const u = await create.run(me, { ...scope, displayName: name, email, password })
                if (u) {
                  setCreated({ email: email.trim().toLowerCase(), password })
                  toast({ tone: 'success', title: `${u.displayName} can now sign in` })
                }
              }}
            >
              Create account
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-3 text-sm">
          <Alert tone="success" title="Share these sign-in details privately">
            They sign in at <strong>{scope.role === 'staff' ? 'Department Authority' : 'Higher Officials'} login</strong> and can change the password later.
          </Alert>
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 rounded-lg border border-line bg-canvas p-3 font-mono text-[13px]">
            <dt className="font-sans text-ink-muted">Email</dt>
            <dd>{created.email}</dd>
            <dt className="font-sans text-ink-muted">Password</dt>
            <dd>{created.password}</dd>
          </dl>
          <p className="text-xs text-ink-muted">This password is shown only once and is not stored anywhere in the app.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {create.error && <Alert tone="error">{create.error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={create.fieldErrors.displayName}>
              {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label="Email" required error={create.fieldErrors.email}>
              {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
          </div>
          <Field label="Temporary password" required error={create.fieldErrors.password} hint="At least 8 characters with a capital letter and a number.">
            {(p) => (
              <div className="flex gap-2">
                <Input {...p} value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                <Button variant="secondary" icon={<KeyRound className="size-4" />} onClick={() => setPassword(tempPassword())}>
                  New
                </Button>
              </div>
            )}
          </Field>
          <ScopeFields value={scope} onChange={setScope} errors={create.fieldErrors} allowCitizen={false} />
        </div>
      )}
    </Dialog>
  )
}

function EditDialog({ target, onClose }: { target: UserProfile | null; onClose: () => void }) {
  const me = useCurrentUser()
  const { toast } = useToast()
  const [scope, setScope] = useState<AdminUserInput | null>(null)
  const update = useMutation(api.admin.updateUser)
  const value: AdminUserInput | null =
    scope ?? (target ? { role: target.role, departmentId: target.departmentId, zoneIds: target.zoneIds, allZones: !!target.allZones, title: target.title ?? '' } : null)

  const close = () => {
    setScope(null)
    update.reset()
    onClose()
  }

  return (
    <Dialog
      open={!!target}
      onClose={close}
      title={target ? `Change access — ${target.displayName}` : ''}
      description={target?.email ?? undefined}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            loading={update.pending}
            onClick={async () => {
              if (!target || !value) return
              const u = await update.run(me, target.id, value)
              if (u) {
                toast({ tone: 'success', title: `${u.displayName} is now ${ROLE_LABEL[u.role].toLowerCase()}` })
                close()
              }
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      {value && (
        <div className="space-y-4">
          {update.error && <Alert tone="error">{update.error}</Alert>}
          <ScopeFields value={value} onChange={setScope} errors={update.fieldErrors} allowCitizen />
          <p className="text-xs text-ink-muted">Every change is recorded in the audit trail.</p>
        </div>
      )}
    </Dialog>
  )
}

function DecideDialog({ request, decision, onClose }: { request: AccessRequest | null; decision: 'approved' | 'rejected'; onClose: () => void }) {
  const me = useCurrentUser()
  const { toast } = useToast()
  const [scope, setScope] = useState<AdminUserInput | null>(null)
  const [reason, setReason] = useState('')
  const decide = useMutation(api.admin.decideAccess)
  const value: AdminUserInput | null =
    scope ?? (request ? { role: request.requestedRole, departmentId: request.departmentId, zoneIds: [], allZones: request.requestedRole === 'supervisor', title: '' } : null)

  const close = () => {
    setScope(null)
    setReason('')
    decide.reset()
    onClose()
  }

  return (
    <Dialog
      open={!!request}
      onClose={close}
      title={request ? `${decision === 'approved' ? 'Approve' : 'Reject'} access — ${request.displayName}` : ''}
      description={request ? `${request.email ?? ''} · requested ${request.requestedRole === 'staff' ? 'Department Authority' : 'Higher Official'} access` : undefined}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant={decision === 'approved' ? 'success' : 'danger'}
            loading={decide.pending}
            icon={decision === 'approved' ? <Check className="size-4" /> : <X className="size-4" />}
            onClick={async () => {
              if (!request || !value) return
              const r = await decide.run(me, request.id, decision === 'approved' ? { ...value, decision, reason } : { decision, reason })
              if (r) {
                toast({ tone: 'success', title: decision === 'approved' ? `${request.displayName} now has access` : 'Request rejected' })
                close()
              }
            }}
          >
            {decision === 'approved' ? 'Approve & grant access' : 'Reject request'}
          </Button>
        </>
      }
    >
      {request && value && (
        <div className="space-y-4">
          {decide.error && <Alert tone="error">{decide.error}</Alert>}
          {request.note && <blockquote className="rounded-lg border-l-4 border-brand-200 bg-brand-50 px-3 py-2 text-sm text-ink-soft">“{request.note}”</blockquote>}
          {decision === 'approved' && <ScopeFields value={value} onChange={setScope} errors={decide.fieldErrors} allowCitizen={false} />}
          <Field label={decision === 'approved' ? 'Note to the person' : 'Reason for rejecting'} required={decision === 'rejected'} error={decide.fieldErrors.reason}>
            {(p) => <Textarea {...p} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        </div>
      )}
    </Dialog>
  )
}

function AccessRequests() {
  const me = useCurrentUser()
  const { data, error, reload } = useApi(() => api.admin.accessRequests(me, 'pending'), [me.id])
  const [deciding, setDeciding] = useState<{ request: AccessRequest; decision: 'approved' | 'rejected' } | null>(null)
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data?.length) return null
  return (
    <Card className="mb-6 border-orange-200">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Inbox className="size-4 text-orange-600" aria-hidden />
        <h2 className="text-sm font-semibold">Access requests waiting for you ({data.length})</h2>
      </div>
      <ul className="divide-y divide-line">
        {data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {r.displayName}
                <Badge tone={r.requestedRole === 'staff' ? 'blue' : 'violet'}>{r.requestedRole === 'staff' ? 'Department Authority' : 'Higher Official'}</Badge>
              </p>
              <p className="truncate text-xs text-ink-muted">
                {r.email}
                {r.departmentId ? ` · ${getDepartment(r.departmentId)?.shortName ?? ''}` : ''} · {formatDateTime(r.createdAt)}
              </p>
              {r.note && <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">“{r.note}”</p>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="success" icon={<Check className="size-3.5" />} onClick={() => setDeciding({ request: r, decision: 'approved' })}>
                Approve
              </Button>
              <Button size="sm" variant="secondary" icon={<X className="size-3.5" />} onClick={() => setDeciding({ request: r, decision: 'rejected' })}>
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <DecideDialog request={deciding?.request ?? null} decision={deciding?.decision ?? 'approved'} onClose={() => setDeciding(null)} />
    </Card>
  )
}

export default function UserManagement() {
  const me = useCurrentUser()
  const { data, error, initialLoading, reload } = useApi(() => api.admin.users(me), [me.id])
  const [view, setView] = useState<View>('all')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<UserProfile | null>(null)

  const inView = (u: UserProfile, v: View) => (v === 'all' ? true : v === 'authority' ? u.role === 'staff' : v === 'official' ? u.role === 'supervisor' || u.role === 'administrator' : u.role === 'citizen')
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    return (data ?? []).filter((u) => inView(u, view) && (!query || `${u.displayName} ${u.email ?? ''}`.toLowerCase().includes(query)))
  }, [data, view, q])

  return (
    <div>
      <PageHeader
        title="User management"
        description="Create Department Authority and Higher Official accounts and change roles. Citizens register themselves."
        actions={
          <Button onClick={() => setCreating(true)} icon={<UserPlus className="size-4" />}>
            Create account
          </Button>
        }
      />
      <AccessRequests />
      <Card>
        <Tabs
          label="User groups"
          className="px-3"
          value={view}
          onChange={setView}
          tabs={[
            { id: 'all', label: 'Everyone', count: data?.length ?? 0 },
            { id: 'authority', label: 'Authorities', count: (data ?? []).filter((u) => inView(u, 'authority')).length },
            { id: 'official', label: 'Higher officials', count: (data ?? []).filter((u) => inView(u, 'official')).length },
            { id: 'citizen', label: 'Citizens', count: (data ?? []).filter((u) => inView(u, 'citizen')).length },
          ]}
        />
        <div className="border-b border-line p-4">
          <label className="relative block max-w-md">
            <span className="sr-only">Search users</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <Input type="search" className="pl-9" placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : initialLoading ? (
          <div className="p-4">
            <LoadingBlock rows={5} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title="No users in this view" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800" aria-hidden>
                  {u.displayName
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {u.displayName}
                    <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                    {u.id === me.id && <span className="text-xs text-ink-muted">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {u.email}
                    {u.title ? ` · ${u.title}` : ''}
                    {scopeText(u) ? ` · ${scopeText(u)}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="secondary" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(u)} disabled={u.id === me.id}>
                  Change access
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <CreateDialog open={creating} onClose={() => setCreating(false)} />
      <EditDialog target={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
