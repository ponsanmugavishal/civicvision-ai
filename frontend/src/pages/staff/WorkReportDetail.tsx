import { ArrowLeft, CalendarClock, ExternalLink, Lock, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { BaseMap } from '@/components/map/BaseMap'
import { ReportMarkers } from '@/components/map/ReportMarkers'
import { CategoryIcon, StatusBadge } from '@/components/report/Badges'
import { DeadlinePanel } from '@/components/report/DeadlinePanel'
import { EvidenceGallery } from '@/components/report/EvidenceGallery'
import { ReportFacts } from '@/components/report/ReportFacts'
import { Timeline } from '@/components/report/Timeline'
import { DisputeDecisionDialog, EscalationReviewDialog, ExtensionReviewDialog } from '@/components/supervisor/ReviewDialogs'
import { Badge, DemoTag } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { useCurrentUser } from '@/context/AuthContext'
import { getUser } from '@/data/directory'
import { useApi } from '@/hooks/useApi'
import { CATEGORY_META, DEADLINE_KIND_LABEL, isActive } from '@/lib/domain'
import { formatDateTime } from '@/lib/format'
import { api } from '@/services'
import type { DeadlineExtensionRequest, EscalationEvent, Feedback } from '@/types'
import { AssigneeLine, EvidenceUploadCard, ExtensionRequestDialog, NoteCard, SeverityCard, StatusCard, TriageHints } from './workActions'

const ESC_TONE = { open: 'red', under_review: 'orange', actioned: 'blue', closed: 'gray' } as const

export default function WorkReportDetail() {
  const { id = '' } = useParams()
  const user = useCurrentUser()
  const base = user.role === 'staff' ? '/staff' : '/supervisor'
  const isSupervisor = user.role !== 'staff'
  const { data, error, initialLoading, reload } = useApi(() => api.work.get(user, id), [id, user.id])
  const [extOpen, setExtOpen] = useState(false)
  const [reviewExt, setReviewExt] = useState<DeadlineExtensionRequest | null>(null)
  const [reviewEsc, setReviewEsc] = useState<EscalationEvent | null>(null)
  const [dispute, setDispute] = useState<Feedback | null>(null)

  if (error)
    return (
      <div>
        <ButtonLink to={base === '/staff' ? '/staff/queue' : '/supervisor/complaints'} variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} className="mb-4 -ml-2">
          Back
        </ButtonLink>
        <ErrorState message={error} onRetry={reload} />
      </div>
    )
  if (initialLoading || !data) return <LoadingBlock rows={10} />

  const { report, evidence, extensions, escalations, feedback, timeline } = data
  const citizen = data.reporter ?? getUser(report.citizenId) ?? null
  const pendingExt = extensions.find((x) => x.status === 'pending')
  const pendingDispute = feedback.find((f) => f.reopenDecision === 'pending')
  const canWork = isSupervisor || report.assignedStaffId === user.id
  const openEsc = escalations.filter((e) => e.status === 'open' || e.status === 'under_review')

  return (
    <div>
      <ButtonLink to={base === '/staff' ? '/staff/queue' : '/supervisor/complaints'} variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} className="mb-4 -ml-2">
        {base === '/staff' ? 'Work queue' : 'All complaints'}
      </ButtonLink>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-sm text-ink-muted">
            {report.publicId} {report.isDemo && <DemoTag />}
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CategoryIcon category={report.category} className="size-6" />
            {CATEGORY_META[report.category].label}
          </h1>
          <p className="mt-2 max-w-3xl text-ink-soft">{report.description}</p>
          <p className="mt-2 text-sm text-ink-muted">
            Assigned to: <AssigneeLine report={report} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={report.status} />
          <Link to={`/reports/${report.id}`} className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
            Public view <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      <div className="mb-6 space-y-3">
        {openEsc.length > 0 && (
          <Alert tone="error" title={`${openEsc.length} open escalation${openEsc.length > 1 ? 's' : ''}`}>
            {openEsc.map((e) => e.reason).join(' ')}
          </Alert>
        )}
        {pendingExt && (
          <Alert
            tone="warning"
            title="Extension request pending"
            action={isSupervisor && <Button size="sm" variant="secondary" onClick={() => setReviewExt(pendingExt)}>Review</Button>}
          >
            {DEADLINE_KIND_LABEL[pendingExt.deadlineKind]} → {formatDateTime(pendingExt.requestedDeadline)} · requested by {getUser(pendingExt.requestedBy)?.displayName}: “{pendingExt.reason}”
          </Alert>
        )}
        {pendingDispute && (
          <Alert tone="warning" title="Citizen disputes the resolution" action={isSupervisor && <Button size="sm" variant="secondary" onClick={() => setDispute(pendingDispute)}>Decide</Button>}>
            “{pendingDispute.comment}”
          </Alert>
        )}
        {user.role === 'staff' && !canWork && report.status !== 'open' && <Alert>This complaint is assigned to a colleague. You can view it because it's in your department and zone.</Alert>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Complaint details" />
              <CardBody className="py-1">
                <ReportFacts report={report} />
              </CardBody>
            </Card>
            <div className="space-y-6">
              <Card>
                <CardHeader
                  title="Response deadlines"
                  description="Illustrative demo targets."
                  icon={<CalendarClock className="size-4" />}
                  action={
                    user.role === 'staff' &&
                    canWork &&
                    isActive(report.status) &&
                    !pendingExt && (
                      <Button size="sm" variant="secondary" onClick={() => setExtOpen(true)}>
                        Request extension
                      </Button>
                    )
                  }
                />
                <CardBody className="py-1">
                  <DeadlinePanel report={report} />
                </CardBody>
              </Card>
              <Card className="overflow-hidden">
                <BaseMap label="Complaint location" className="h-56" center={[report.latitude, report.longitude]} zoom={16}>
                  <ReportMarkers reports={[report]} selectedId={report.id} cluster={false} />
                </BaseMap>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader title="Photos & evidence" />
            <CardBody>
              <EvidenceGallery evidence={evidence} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Full activity history" description="Includes internal notes, assignments, extensions and escalations. Entries cannot be edited or deleted." />
            <CardBody>
              <Timeline entries={timeline} newestFirst />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <StatusCard user={user} report={report} evidence={evidence} />
          {canWork && isActive(report.status) && <SeverityCard user={user} report={report} />}
          <TriageHints report={report} basePath={`${base}/reports`} />
          {canWork && isActive(report.status) && <EvidenceUploadCard user={user} report={report} />}
          {canWork && <NoteCard user={user} report={report} />}

          {escalations.length > 0 && (
            <Card>
              <CardHeader title="Escalations" icon={<ShieldAlert className="size-4" />} />
              <ul className="divide-y divide-line">
                {escalations.map((e) => (
                  <li key={e.id} className="px-5 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        Level {e.level} · {DEADLINE_KIND_LABEL[e.deadlineKind]}
                      </span>
                      <Badge tone={ESC_TONE[e.status]}>{e.status.replace('_', ' ')}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted">Triggered {formatDateTime(e.triggeredAt)}</p>
                    {e.actionTaken && <p className="mt-1 text-ink-soft">{e.actionTaken}</p>}
                    {isSupervisor && e.status !== 'closed' && (
                      <Button size="sm" variant="secondary" className="mt-2" onClick={() => setReviewEsc(e)}>
                        Review
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Reporter" icon={<Lock className="size-4" />} description="Restricted — visible to authorised staff only, never on public pages." />
            <CardBody className="text-sm">
              {citizen ? (
                <dl className="grid grid-cols-[5rem_1fr] gap-y-1">
                  <dt className="text-ink-muted">Name</dt>
                  <dd>{citizen.displayName}</dd>
                  <dt className="text-ink-muted">Email</dt>
                  <dd className="break-all">{citizen.email}</dd>
                  {citizen.phone && (
                    <>
                      <dt className="text-ink-muted">Phone</dt>
                      <dd>{citizen.phone}</dd>
                    </>
                  )}
                </dl>
              ) : (
                <p className="text-ink-muted">Reporter record unavailable.</p>
              )}
              {report.isDemo && <p className="mt-2 text-xs text-ink-muted">Fictional sample contact details.</p>}
            </CardBody>
          </Card>
        </div>
      </div>

      {extOpen && <ExtensionRequestDialog open onClose={() => setExtOpen(false)} user={user} report={report} />}
      <ExtensionReviewDialog ext={reviewExt} user={user} onClose={() => setReviewExt(null)} />
      <EscalationReviewDialog esc={reviewEsc} user={user} onClose={() => setReviewEsc(null)} />
      <DisputeDecisionDialog dispute={dispute} user={user} onClose={() => setDispute(null)} />
    </div>
  )
}
