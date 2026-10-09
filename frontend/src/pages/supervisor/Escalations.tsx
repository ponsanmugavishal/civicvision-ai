import { ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CategoryIcon, SeverityBadge, StatusBadge } from '@/components/report/Badges'
import { EscalationReviewDialog } from '@/components/supervisor/ReviewDialogs'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { Select } from '@/components/ui/Field'
import { PageHeader, Tabs } from '@/components/ui/Layout'
import { useCurrentUser } from '@/context/AuthContext'
import { getUser } from '@/data/directory'
import { useApi } from '@/hooks/useApi'
import { DEADLINE_KIND_LABEL } from '@/lib/domain'
import { formatDateTime } from '@/lib/format'
import { api, type EscalationRow } from '@/services'

type Tab = 'open' | 'all' | 'resolved'
const TONE = { open: 'red', under_review: 'orange', actioned: 'blue', closed: 'gray' } as const

export default function Escalations() {
  const user = useCurrentUser()
  const [tab, setTab] = useState<Tab>('open')
  const [level, setLevel] = useState('')
  const [review, setReview] = useState<EscalationRow | null>(null)
  const { data, error, initialLoading, reload } = useApi(() => api.supervisor.escalations(user), [user.id])

  const inTab = (e: EscalationRow, t: Tab) => (t === 'all' ? true : t === 'open' ? e.status === 'open' || e.status === 'under_review' : e.status === 'actioned' || e.status === 'closed')
  const rows = useMemo(() => (data ?? []).filter((e) => inTab(e, tab) && (!level || String(e.level) === level)), [data, tab, level])

  return (
    <div>
      <PageHeader
        title="Escalation history"
        description="Created automatically when a response target is missed. Entries are permanent — reviewing records your action without erasing the breach."
        actions={
          <label className="w-40">
            <span className="sr-only">Escalation level</span>
            <Select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">All levels</option>
              <option value="1">Level 1</option>
              <option value="2">Level 2</option>
              <option value="3">Level 3</option>
            </Select>
          </label>
        }
      />
      <Card>
        <Tabs
          label="Escalation views"
          className="px-3"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'open', label: 'Needs review', count: (data ?? []).filter((e) => inTab(e, 'open')).length },
            { id: 'resolved', label: 'Actioned & closed', count: (data ?? []).filter((e) => inTab(e, 'resolved')).length },
            { id: 'all', label: 'All', count: data?.length ?? 0 },
          ]}
        />
        {error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : initialLoading ? (
          <div className="p-4">
            <LoadingBlock rows={6} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="size-6" />} title="No escalations in this view" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((e) => (
              <li key={e.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={e.level === 3 ? 'red' : e.level === 2 ? 'orange' : 'amber'}>Level {e.level}</Badge>
                    <Badge tone={TONE[e.status]}>{e.status.replace('_', ' ')}</Badge>
                    <span className="text-xs text-ink-muted">{DEADLINE_KIND_LABEL[e.deadlineKind]} deadline · due {formatDateTime(e.deadlineAt)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-ink">{e.reason}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                    <Link to={`/supervisor/reports/${e.report.id}`} className="inline-flex items-center gap-1.5 font-mono font-semibold text-brand-700 hover:underline">
                      <CategoryIcon category={e.report.category} />
                      {e.report.publicId}
                    </Link>
                    <StatusBadge status={e.report.status} />
                    <SeverityBadge severity={e.report.severity} />
                    <span>Triggered {formatDateTime(e.triggeredAt)} · notified {e.notifiedRole}s (in-app)</span>
                  </div>
                  {e.actionTaken && (
                    <p className="mt-2 rounded-md bg-canvas px-2.5 py-1.5 text-xs text-ink-soft">
                      <strong>Action:</strong> {e.actionTaken}
                      {e.reviewedBy && <> — {e.reviewedByName ?? getUser(e.reviewedBy)?.displayName}, {formatDateTime(e.reviewedAt)}</>}
                    </p>
                  )}
                </div>
                {e.status !== 'closed' && (
                  <Button size="sm" variant="secondary" onClick={() => setReview(e)} className="shrink-0">
                    Review
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <EscalationReviewDialog esc={review} user={user} onClose={() => setReview(null)} />
    </div>
  )
}
