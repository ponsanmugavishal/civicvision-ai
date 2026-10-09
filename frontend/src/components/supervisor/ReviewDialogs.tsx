import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Alert } from '@/components/ui/Feedback'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { useToast } from '@/context/ToastContext'
import { useMutation } from '@/hooks/useApi'
import { DEADLINE_KIND_LABEL } from '@/lib/domain'
import { formatDateTime } from '@/lib/format'
import { api } from '@/services'
import type { DeadlineExtensionRequest, EscalationEvent, EscalationStatus, Feedback, UserProfile } from '@/types'

export function ExtensionReviewDialog({ ext, user, onClose }: { ext: DeadlineExtensionRequest | null; user: UserProfile; onClose: () => void }) {
  const { toast } = useToast()
  const [reason, setReason] = useState('')
  const review = useMutation(api.supervisor.reviewExtension)
  const decide = async (decision: 'approved' | 'rejected') => {
    if (!ext) return
    const ok = await review.run(user, ext.id, { decision, reason })
    if (ok) {
      toast({ tone: 'success', title: `Extension ${decision}` })
      setReason('')
      onClose()
    }
  }
  return (
    <Dialog
      open={!!ext}
      onClose={onClose}
      title="Review extension request"
      description="A reason is mandatory for both approval and rejection and is recorded in the audit trail."
      footer={
        <>
          <Button variant="danger" onClick={() => decide('rejected')} loading={review.pending} icon={<X className="size-4" />}>
            Reject
          </Button>
          <Button variant="success" onClick={() => decide('approved')} loading={review.pending} icon={<Check className="size-4" />}>
            Approve
          </Button>
        </>
      }
    >
      {ext && (
        <div className="space-y-4">
          {review.error && <Alert tone="error">{review.error}</Alert>}
          <dl className="grid grid-cols-[9rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-ink-muted">Deadline</dt>
            <dd>{DEADLINE_KIND_LABEL[ext.deadlineKind]}</dd>
            <dt className="text-ink-muted">Current target</dt>
            <dd>{formatDateTime(ext.currentDeadline)}</dd>
            <dt className="text-ink-muted">Requested</dt>
            <dd className="font-medium">{formatDateTime(ext.requestedDeadline)}</dd>
            <dt className="text-ink-muted">Justification</dt>
            <dd>{ext.reason}</dd>
          </dl>
          <Field label="Decision reason" required error={review.fieldErrors.reason} hint="Min. 10 characters.">
            {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <p className="text-xs text-ink-muted">Approving moves only the forward-looking target. Any escalation already raised for a missed deadline stays on record.</p>
        </div>
      )}
    </Dialog>
  )
}

export function EscalationReviewDialog({ esc, user, onClose }: { esc: EscalationEvent | null; user: UserProfile; onClose: () => void }) {
  const { toast } = useToast()
  const [status, setStatus] = useState<EscalationStatus>('actioned')
  const [action, setAction] = useState('')
  const review = useMutation(api.supervisor.reviewEscalation)
  return (
    <Dialog
      open={!!esc}
      onClose={onClose}
      title="Review escalation"
      description={esc?.reason}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={review.pending}
            onClick={async () => {
              if (!esc) return
              const ok = await review.run(user, esc.id, { status, actionTaken: action })
              if (ok) {
                toast({ tone: 'success', title: 'Escalation updated' })
                setAction('')
                onClose()
              }
            }}
          >
            Save review
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {review.error && <Alert tone="error">{review.error}</Alert>}
        <Field label="Mark as" required>
          {(p) => (
            <Select {...p} value={status} onChange={(e) => setStatus(e.target.value as EscalationStatus)}>
              <option value="under_review">Under review</option>
              <option value="actioned">Actioned (intervention made)</option>
              <option value="closed">Closed</option>
            </Select>
          )}
        </Field>
        <Field label="Action taken" required error={review.fieldErrors.actionTaken} hint="e.g. Called the department lead; reassigned to a second crew. Min. 10 characters.">
          {(p) => <Textarea {...p} rows={3} value={action} onChange={(e) => setAction(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}

export function DisputeDecisionDialog({ dispute, user, onClose }: { dispute: Feedback | null; user: UserProfile; onClose: () => void }) {
  const { toast } = useToast()
  const [reason, setReason] = useState('')
  const decide = useMutation(api.supervisor.decideReopen)
  const run = async (decision: 'approved' | 'declined') => {
    if (!dispute) return
    const ok = await decide.run(user, dispute.id, { decision, reason })
    if (ok) {
      toast({ tone: 'success', title: decision === 'approved' ? 'Complaint reopened' : 'Reopen request declined' })
      setReason('')
      onClose()
    }
  }
  return (
    <Dialog
      open={!!dispute}
      onClose={onClose}
      title="Review disputed resolution"
      description="Approving reopens the complaint with fresh action and resolution targets."
      footer={
        <>
          <Button variant="secondary" onClick={() => run('declined')} loading={decide.pending}>
            Decline
          </Button>
          <Button onClick={() => run('approved')} loading={decide.pending}>
            Approve & reopen
          </Button>
        </>
      }
    >
      {dispute && (
        <div className="space-y-4">
          {decide.error && <Alert tone="error">{decide.error}</Alert>}
          <blockquote className="rounded-lg border-l-4 border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-950">“{dispute.comment}”</blockquote>
          <Field label="Decision reason" required error={decide.fieldErrors.reason} hint="Shared with the citizen. Min. 10 characters.">
            {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        </div>
      )}
    </Dialog>
  )
}
