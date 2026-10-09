import { ArrowRightLeft, CalendarClock, Camera, CheckCircle2, Gauge, Hand, Layers, MessageSquarePlus, RefreshCw, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { PhotoInput } from '@/components/report/PhotoInput'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { Alert } from '@/components/ui/Feedback'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field'
import { useToast } from '@/context/ToastContext'
import { DEPARTMENTS, getUser, USERS } from '@/data/directory'
import { useMutation } from '@/hooks/useApi'
import { CATEGORY_META, DEADLINE_KIND_LABEL, SEVERITIES, SEVERITY_META, STATUS_META, isActive, nextStatuses } from '@/lib/domain'
import { formatDateTime } from '@/lib/format'
import { api } from '@/services'
import type { DeadlineKind, Evidence, EvidenceType, Report, ReportStatus, Severity, UserProfile } from '@/types'

/* ------------------------------------------------------------------ assign / reassign */

export function AssignDialog({ open, onClose, user, report }: { open: boolean; onClose: () => void; user: UserProfile; report: Report }) {
  const { toast } = useToast()
  const isSupervisor = user.role !== 'staff'
  const [departmentId, setDepartmentId] = useState(report.departmentId ?? user.departmentId ?? DEPARTMENTS[0].id)
  const [staffId, setStaffId] = useState<string>('')
  const [reason, setReason] = useState('')
  const assign = useMutation(api.work.assign)

  const staffOptions = useMemo(
    () => USERS.filter((u) => u.role === 'staff' && u.departmentId === departmentId).map((u) => ({ u, inZone: !u.zoneIds.length || (!!report.zoneId && u.zoneIds.includes(report.zoneId)) })),
    [departmentId, report.zoneId],
  )

  const submit = async () => {
    const ok = await assign.run(user, report.id, { departmentId, staffId: staffId || null, reason })
    if (ok) {
      toast({ tone: 'success', title: report.status === 'open' ? 'Complaint assigned' : 'Complaint reassigned' })
      onClose()
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={report.departmentId ? 'Reassign complaint' : 'Assign complaint'}
      description={isSupervisor ? 'Move this complaint to any department and staff member you oversee.' : 'Hand this complaint to a colleague in your department.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={assign.pending} icon={<ArrowRightLeft className="size-4" />}>
            Confirm assignment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {assign.error && <Alert tone="error">{assign.error}</Alert>}
        <Field label="Department" required>
          {(p) => (
            <Select
              {...p}
              value={departmentId}
              disabled={!isSupervisor}
              onChange={(e) => {
                setDepartmentId(e.target.value)
                setStaffId('')
              }}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Staff member" error={assign.fieldErrors.staffId} hint={isSupervisor ? 'Leave as “Department queue” to assign to the department without a named person.' : undefined}>
          {(p) => (
            <Select {...p} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">{isSupervisor ? 'Department queue (no named person)' : 'Select a colleague…'}</option>
              {staffOptions.map(({ u, inZone }) => (
                <option key={u.id} value={u.id} disabled={!inZone || u.id === report.assignedStaffId}>
                  {u.displayName} — {u.title}
                  {!inZone ? ' (outside zone)' : u.id === report.assignedStaffId ? ' (current)' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Reason" required error={assign.fieldErrors.reason} hint="Recorded in the assignment history and audit trail (min. 10 characters).">
          {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Requires drainage crew; moving to the Drains department." />}
        </Field>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ status workflow */

export function StatusCard({ user, report, evidence }: { user: UserProfile; report: Report; evidence: Evidence[] }) {
  const { toast } = useToast()
  const canAct = user.role !== 'staff' || report.assignedStaffId === user.id || (report.status === 'open' && !report.assignedStaffId)
  const options = nextStatuses(report.status).filter((s) => !(s === 'assigned' && report.status === 'open'))
  const [next, setNext] = useState<ReportStatus | ''>('')
  const [comment, setComment] = useState('')
  const [summary, setSummary] = useState('')
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const update = useMutation(api.work.updateStatus)
  const accept = useMutation(api.work.accept)
  const hasResolutionPhoto = evidence.some((e) => e.type === 'resolution')

  const doUpdate = async () => {
    if (!next) return
    const ok = await update.run(user, report.id, { newStatus: next, comment, resolutionSummary: summary })
    setConfirmOpen(false)
    if (ok) {
      toast({ tone: 'success', title: `Status changed to ${STATUS_META[next].label}` })
      setNext('')
      setComment('')
      setSummary('')
    }
  }

  return (
    <Card>
      <CardHeader title="Workflow" description={`Current status: ${STATUS_META[report.status].label}`} icon={<RefreshCw className="size-4" />} />
      <CardBody className="space-y-4">
        {!isActive(report.status) && report.status !== 'resolved' && <p className="text-sm text-ink-muted">This complaint is closed. No further status changes are possible.</p>}
        {report.status === 'resolved' && <p className="text-sm text-ink-muted">Resolved complaints can only be reopened by a supervisor after reviewing a citizen dispute.</p>}

        {(report.status === 'open' || isActive(report.status)) && (
          <div className="flex flex-wrap gap-2">
            {user.role === 'staff' && report.status === 'open' && !report.assignedStaffId && (
              <Button onClick={() => setAcceptOpen(true)} icon={<Hand className="size-4" />}>
                Accept & acknowledge
              </Button>
            )}
            {(user.role !== 'staff' || report.assignedStaffId === user.id) && (
              <Button variant="secondary" onClick={() => setAssignOpen(true)} icon={<ArrowRightLeft className="size-4" />}>
                {user.role === 'staff' ? 'Hand over' : report.departmentId ? 'Reassign' : 'Assign'}
              </Button>
            )}
          </div>
        )}

        {canAct && options.length > 0 && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (next) setConfirmOpen(true)
            }}
            className="space-y-3 border-t border-line pt-4"
          >
            {update.error && <Alert tone="error">{update.error}</Alert>}
            <Field label="Move to" required>
              {(p) => (
                <Select {...p} value={next} onChange={(e) => setNext(e.target.value as ReportStatus)}>
                  <option value="">Choose next status…</option>
                  {options.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {next === 'resolved' && !hasResolutionPhoto && <Alert tone="warning">Upload at least one resolution photo (below) before resolving.</Alert>}
            {next === 'resolved' && (
              <Field label="Resolution summary" required error={update.fieldErrors.resolutionSummary} hint="Shown publicly. Describe what was done (min. 20 characters).">
                {(p) => <Textarea {...p} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Drain desilted over 30 m; outlet cleared." />}
              </Field>
            )}
            <Field
              label={next === 'rejected' ? 'Reason for rejection' : 'Update comment'}
              required
              error={update.fieldErrors.comment}
              hint={next === 'rejected' ? 'Shown to the citizen (min. 20 characters).' : 'Recorded in the public status history (min. 10 characters).'}
            >
              {(p) => <Textarea {...p} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />}
            </Field>
            <Button type="submit" disabled={!next} icon={<CheckCircle2 className="size-4" />}>
              Update status
            </Button>
          </form>
        )}
        {!canAct && isActive(report.status) && <p className="text-sm text-ink-muted">Only the assigned staff member or a supervisor can change this complaint's status.</p>}
      </CardBody>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={next ? `Move to “${STATUS_META[next].label}”?` : ''}
        body={
          next === 'resolved'
            ? 'The complaint will be marked resolved with your summary and resolution evidence. The citizen can rate it or request reopening.'
            : next === 'rejected'
              ? 'The complaint will be closed without action. Your reason will be visible to the citizen.'
              : 'This change is recorded permanently in the status history.'
        }
        confirmLabel="Confirm change"
        tone={next === 'rejected' ? 'danger' : 'primary'}
        loading={update.pending}
        onConfirm={doUpdate}
      />
      <AcceptDialog open={acceptOpen} onClose={() => setAcceptOpen(false)} pending={accept.pending} error={accept.error} onAccept={async (note) => {
        const ok = await accept.run(user, report.id, note)
        if (ok) {
          toast({ tone: 'success', title: 'Complaint accepted', body: 'Acknowledgement recorded and assigned to you.' })
          setAcceptOpen(false)
        }
      }} />
      {assignOpen && <AssignDialog open onClose={() => setAssignOpen(false)} user={user} report={report} />}
    </Card>
  )
}

function AcceptDialog({ open, onClose, onAccept, pending, error }: { open: boolean; onClose: () => void; onAccept: (note: string) => void; pending: boolean; error: string | null }) {
  const [note, setNote] = useState('')
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Accept complaint"
      description="You will be recorded as the responsible staff member and the acknowledgement target will be marked as met or late."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onAccept(note)} loading={pending} icon={<Hand className="size-4" />}>
            Accept
          </Button>
        </>
      }
    >
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      <Field label="Acknowledgement message" hint="Optional — shown in the public timeline.">
        {(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Inspection scheduled for tomorrow morning." />}
      </Field>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ notes */

export function NoteCard({ user, report }: { user: UserProfile; report: Report }) {
  const { toast } = useToast()
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const add = useMutation(api.work.addNote)
  return (
    <Card>
      <CardHeader title="Add progress note" icon={<MessageSquarePlus className="size-4" />} />
      <CardBody>
        <form
          noValidate
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const ok = await add.run(user, report.id, { body, internal })
            if (ok) {
              toast({ tone: 'success', title: internal ? 'Internal note added' : 'Public update posted' })
              setBody('')
            }
          }}
        >
          {add.error && <Alert tone="error">{add.error}</Alert>}
          <Field label="Note" required error={add.fieldErrors.body}>
            {(p) => <Textarea {...p} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened on site? What's next?" />}
          </Field>
          <Checkbox checked={internal} onChange={(e) => setInternal(e.target.checked)} label="Internal note (hidden from citizens and the public)" />
          <Button type="submit" variant="secondary" loading={add.pending}>
            {internal ? 'Add internal note' : 'Post public update'}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

/* ------------------------------------------------------------------ evidence */

export function EvidenceUploadCard({ user, report }: { user: UserProfile; report: Report }) {
  const { toast } = useToast()
  const [photo, setPhoto] = useState<string | null>(null)
  const [type, setType] = useState<EvidenceType>(report.status === 'in_progress' ? 'resolution' : 'progress')
  const [caption, setCaption] = useState('')
  const [photoError, setPhotoError] = useState<string>()
  const add = useMutation(api.work.addEvidence)
  return (
    <Card>
      <CardHeader title="Upload evidence" description="Progress and resolution photos are visible on the public complaint page." icon={<Camera className="size-4" />} />
      <CardBody>
        <form
          noValidate
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!photo) return setPhotoError('Choose a photo to upload.')
            setPhotoError(undefined)
            const ok = await add.run(user, report.id, { dataUrl: photo, type, caption })
            if (ok) {
              toast({ tone: 'success', title: 'Evidence uploaded', body: 'Saved in this browser (demo mode).' })
              setPhoto(null)
              setCaption('')
            }
          }}
        >
          {add.error && <Alert tone="error">{add.error}</Alert>}
          <PhotoInput value={photo} onChange={setPhoto} error={photoError} label="Photo" required />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Evidence type" required>
              {(p) => (
                <Select {...p} value={type} onChange={(e) => setType(e.target.value as EvidenceType)}>
                  <option value="progress">Progress</option>
                  <option value="resolution">Resolution (after)</option>
                  <option value="other">Other</option>
                </Select>
              )}
            </Field>
            <Field label="Caption" hint="Optional">
              {(p) => <Input {...p} value={caption} maxLength={140} onChange={(e) => setCaption(e.target.value)} />}
            </Field>
          </div>
          <Button type="submit" variant="secondary" loading={add.pending} icon={<Camera className="size-4" />}>
            Upload photo
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

/* ------------------------------------------------------------------ extension request */

export function ExtensionRequestDialog({ open, onClose, user, report }: { open: boolean; onClose: () => void; user: UserProfile; report: Report }) {
  const { toast } = useToast()
  const [kind, setKind] = useState<DeadlineKind>(report.actionStartedAt ? 'resolution' : report.acknowledgedAt ? 'action' : 'acknowledgement')
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const req = useMutation(api.work.requestExtension)
  const min = new Date(Math.max(Date.now(), new Date(report.deadlines[kind]).getTime()) + 3_600_000).toISOString().slice(0, 16)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Request a deadline extension"
      description="A supervisor must approve or reject it with a reason. Any deadline already missed stays on record."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={req.pending}
            icon={<CalendarClock className="size-4" />}
            onClick={async () => {
              const ok = await req.run(user, report.id, { deadlineKind: kind, requestedDeadline: date ? new Date(date).toISOString() : '', reason })
              if (ok) {
                toast({ tone: 'success', title: 'Extension requested', body: 'Supervisors have been notified in-app.' })
                onClose()
              }
            }}
          >
            Submit request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {req.error && <Alert tone="error">{req.error}</Alert>}
        <Field label="Deadline" required>
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as DeadlineKind)}>
              {(['acknowledgement', 'action', 'resolution'] as DeadlineKind[]).map((k) => (
                <option key={k} value={k}>
                  {DEADLINE_KIND_LABEL[k]} — currently {formatDateTime(report.deadlines[k])}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="New requested deadline" required error={req.fieldErrors.requestedDeadline}>
          {(p) => <Input {...p} type="datetime-local" min={min} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label="Justification" required error={req.fieldErrors.reason} hint="Min. 20 characters.">
          {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Specialised equipment needed; contractor available from Monday." />}
        </Field>
      </div>
    </Dialog>
  )
}

export function AssigneeLine({ report }: { report: Report }) {
  const staff = getUser(report.assignedStaffId)
  return staff ? (
    <span>
      {staff.displayName} <span className="text-ink-muted">· {staff.title}</span>
    </span>
  ) : (
    <Badge tone="gray">Unassigned</Badge>
  )
}

/* ------------------------------------------------------------------ severity triage */

export function SeverityCard({ user, report }: { user: UserProfile; report: Report }) {
  const { toast } = useToast()
  const [severity, setSeverity] = useState<Severity>(report.severity)
  const [reason, setReason] = useState('')
  const update = useMutation(api.work.updateSeverity)
  return (
    <Card>
      <CardHeader title="Severity triage" description="Severity sets the response targets. Changing it is recorded with your reason." icon={<Gauge className="size-4" />} />
      <CardBody>
        <form
          noValidate
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const ok = await update.run(user, report.id, { severity, reason })
            if (ok) {
              toast({ tone: 'success', title: `Severity set to ${SEVERITY_META[severity].label}`, body: 'Targets for unfinished stages were recalculated.' })
              setReason('')
            }
          }}
        >
          {update.error && <Alert tone="error">{update.error}</Alert>}
          <Field label="Severity" required>
            {(p) => (
              <Select {...p} value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_META[s].label}
                    {s === report.severity ? ' (current)' : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Reason" required error={update.fieldErrors.reason} hint="Min. 10 characters, e.g. what you saw on site.">
            {(p) => <Input {...p} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <Button type="submit" variant="secondary" loading={update.pending} disabled={severity === report.severity}>
            Update severity
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

/* ------------------------------------------------------------------ triage hints */

export function TriageHints({ report, basePath }: { report: Report; basePath: string }) {
  const dupes = report.possibleDuplicateIds ?? []
  if (!report.aiSuggestedCategory && !dupes.length) return null
  return (
    <Card>
      <CardHeader title="Triage hints" description="Automated hints for staff. They never change the complaint by themselves." />
      <CardBody className="space-y-4 text-sm">
        {report.aiSuggestedCategory && (
          <div>
            <p className="flex items-center gap-1.5 font-medium">
              <Sparkles className="size-4 text-brand-700" aria-hidden />
              AI photo suggestion: {CATEGORY_META[report.aiSuggestedCategory].short}
              {report.aiSuggestedCategory !== report.category && <Badge tone="orange">Citizen chose {CATEGORY_META[report.category].short}</Badge>}
            </p>
            {report.aiExplanation && <p className="mt-1 text-ink-soft">{report.aiExplanation}</p>}
            {report.aiSuggestedSeverity && <p className="mt-1 text-xs text-ink-muted">Tentative severity from the model: {SEVERITY_META[report.aiSuggestedSeverity].label}. Review it with the severity triage control.</p>}
          </div>
        )}
        {dupes.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 font-medium">
              <Layers className="size-4 text-orange-600" aria-hidden />
              {dupes.length} possible duplicate{dupes.length > 1 ? 's' : ''} nearby at submission
            </p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {dupes.map((id, i) => (
                <li key={id}>
                  <Link to={`${basePath}/${id}`} className="text-brand-700 hover:underline">
                    Open possible duplicate {i + 1}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
