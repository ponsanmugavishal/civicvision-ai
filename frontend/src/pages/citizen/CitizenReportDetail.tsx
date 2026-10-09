import { ArrowLeft, MessageSquareWarning, RotateCcw, Send } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { BaseMap } from '@/components/map/BaseMap'
import { ReportMarkers } from '@/components/map/ReportMarkers'
import { CategoryIcon, StatusBadge } from '@/components/report/Badges'
import { EvidenceGallery } from '@/components/report/EvidenceGallery'
import { ReportFacts } from '@/components/report/ReportFacts'
import { Timeline } from '@/components/report/Timeline'
import { Badge, DemoTag } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Alert, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { Field, Textarea } from '@/components/ui/Field'
import { StarRating } from '@/components/ui/StarRating'
import { useCurrentUser } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useApi, useMutation } from '@/hooks/useApi'
import { CATEGORY_META } from '@/lib/domain'
import { formatDateTime } from '@/lib/format'
import { api } from '@/services'
import type { Feedback, Report } from '@/types'

function FeedbackSection({ report, feedback }: { report: Report; feedback: Feedback[] }) {
  const user = useCurrentUser()
  const { toast } = useToast()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [ratingError, setRatingError] = useState<string>()
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [reopenRating, setReopenRating] = useState(1)
  const submit = useMutation(api.citizen.submitFeedback)

  const pendingDispute = feedback.find((f) => f.reopenDecision === 'pending')
  const rated = feedback.some((f) => !f.reopenRequested)

  const sendRating = async () => {
    if (!rating) return setRatingError('Choose a rating from 1 to 5 stars.')
    setRatingError(undefined)
    const ok = await submit.run(user, report.id, { rating, comment, reopenRequested: false })
    if (ok) {
      toast({ tone: 'success', title: 'Thanks for your feedback' })
      setRating(0)
      setComment('')
    }
  }

  const sendReopen = async () => {
    const ok = await submit.run(user, report.id, { rating: reopenRating, comment: reopenReason, reopenRequested: true })
    if (ok) {
      toast({ tone: 'success', title: 'Reopen request sent', body: 'A supervisor will review it.' })
      setReopenOpen(false)
      setReopenReason('')
    }
  }

  return (
    <Card>
      <CardHeader title="Your feedback" description="Rate the resolution, or ask for the complaint to be reopened if the problem is still there." />
      <CardBody className="space-y-5">
        {feedback.length > 0 && (
          <ul className="space-y-3">
            {feedback.map((f) => (
              <li key={f.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StarRating value={f.rating} readOnly />
                  {f.reopenRequested && (
                    <Badge tone={f.reopenDecision === 'approved' ? 'amber' : f.reopenDecision === 'declined' ? 'gray' : 'orange'}>
                      Reopen {f.reopenDecision === 'pending' ? 'requested — awaiting review' : f.reopenDecision}
                    </Badge>
                  )}
                </div>
                {f.comment && <p className="mt-1.5 text-ink-soft">{f.comment}</p>}
                {f.decisionReason && <p className="mt-1 text-xs text-ink-muted">Supervisor decision: {f.decisionReason}</p>}
                <p className="mt-1 text-xs text-ink-muted">{formatDateTime(f.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}

        {report.status === 'resolved' ? (
          <>
            {!rated && (
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-sm font-medium">How satisfied are you with the resolution?</p>
                  <StarRating value={rating} onChange={setRating} />
                  {ratingError && <p className="mt-1 text-sm text-red-600">{ratingError}</p>}
                </div>
                <Field label="Comment" hint="Optional">
                  {(p) => <Textarea {...p} rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />}
                </Field>
                {submit.error && !reopenOpen && <Alert tone="error">{submit.error}</Alert>}
                <Button onClick={sendRating} loading={submit.pending && !reopenOpen} icon={<Send className="size-4" />}>
                  Submit feedback
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3">
              <p className="flex items-start gap-2 text-sm text-orange-900">
                <MessageSquareWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
                {pendingDispute ? 'Your reopen request is waiting for supervisor review.' : 'Problem still there or came back?'}
              </p>
              {!pendingDispute && (
                <Button size="sm" variant="secondary" onClick={() => setReopenOpen(true)} icon={<RotateCcw className="size-4" />}>
                  Request reopening
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-muted">Feedback and reopen requests become available once the complaint is marked resolved.</p>
        )}
      </CardBody>

      <Dialog
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        title="Request reopening"
        description="Explain what is still wrong. A supervisor reviews every request and records a decision."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReopenOpen(false)}>
              Cancel
            </Button>
            <Button onClick={sendReopen} loading={submit.pending} icon={<RotateCcw className="size-4" />}>
              Send request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {submit.error && <Alert tone="error">{submit.error}</Alert>}
          <div>
            <p className="mb-1 text-sm font-medium">Rating of the resolution</p>
            <StarRating value={reopenRating} onChange={setReopenRating} />
          </div>
          <Field label="Why should it be reopened?" required error={submit.fieldErrors.comment} hint="At least 15 characters.">
            {(p) => <Textarea {...p} rows={4} maxLength={600} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="e.g. Garbage was cleared but dumped again the next day." />}
          </Field>
        </div>
      </Dialog>
    </Card>
  )
}

export default function CitizenReportDetail() {
  const { id = '' } = useParams()
  const user = useCurrentUser()
  const { data, error, initialLoading, reload } = useApi(() => api.citizen.get(user, id), [id, user.id])

  return (
    <div>
      <ButtonLink to="/citizen/reports" variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} className="mb-4 -ml-2">
        My reports
      </ButtonLink>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : initialLoading || !data ? (
        <LoadingBlock rows={8} />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 font-mono text-sm text-ink-muted">
                {data.report.publicId} {data.report.isDemo && <DemoTag />}
              </p>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <CategoryIcon category={data.report.category} className="size-6" />
                {CATEGORY_META[data.report.category].label}
              </h1>
              <p className="mt-2 max-w-3xl text-ink-soft">{data.report.description}</p>
            </div>
            <StatusBadge status={data.report.status} />
          </div>
          {data.report.status === 'rejected' && data.report.rejectionReason && (
            <Alert tone="info" title="Closed without action" className="mb-6">
              {data.report.rejectionReason}
            </Alert>
          )}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="space-y-6">
              <Card>
                <CardHeader title="Complaint details" />
                <CardBody className="py-1">
                  <ReportFacts report={data.report} />
                </CardBody>
              </Card>
              <Card className="overflow-hidden">
                <CardHeader title="Location" />
                <BaseMap label="Complaint location" className="h-56" center={[data.report.latitude, data.report.longitude]} zoom={16}>
                  <ReportMarkers reports={[data.report]} selectedId={data.report.id} cluster={false} />
                </BaseMap>
              </Card>
            </div>
            <div className="space-y-6">
              {data.report.resolutionSummary && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                  <p className="font-semibold">Resolution summary</p>
                  <p className="mt-1">{data.report.resolutionSummary}</p>
                </div>
              )}
              <Card>
                <CardHeader title="Photos & resolution evidence" />
                <CardBody>
                  <EvidenceGallery evidence={data.evidence} />
                </CardBody>
              </Card>
              <FeedbackSection report={data.report} feedback={data.feedback} />
              <Card>
                <CardHeader title="Status timeline" />
                <CardBody>
                  <Timeline entries={data.timeline} />
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
