import { CalendarClock, MessageSquareWarning } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CategoryIcon, DeadlineBadge, StatusBadge } from '@/components/report/Badges'
import { DisputeDecisionDialog, ExtensionReviewDialog } from '@/components/supervisor/ReviewDialogs'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { PageHeader, Tabs } from '@/components/ui/Layout'
import { StarRating } from '@/components/ui/StarRating'
import { useCurrentUser } from '@/context/AuthContext'
import { getUser } from '@/data/directory'
import { useApi } from '@/hooks/useApi'
import { DEADLINE_KIND_LABEL } from '@/lib/domain'
import { formatDateTime } from '@/lib/format'
import { api, type DisputeRow, type ExtensionRow } from '@/services'
import type { Report } from '@/types'

type Tab = 'pending' | 'reviewed' | 'disputes'

function ReportRef({ report }: { report: Report }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Link to={`/supervisor/reports/${report.id}`} className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-brand-700 hover:underline">
        <CategoryIcon category={report.category} />
        {report.publicId}
      </Link>
      <StatusBadge status={report.status} />
      <DeadlineBadge report={report} />
    </span>
  )
}

export default function ExtensionsDisputes() {
  const user = useCurrentUser()
  const [params, setParams] = useSearchParams()
  const tab = (['pending', 'reviewed', 'disputes'].includes(params.get('tab') ?? '') ? params.get('tab') : 'pending') as Tab
  const ext = useApi(() => api.supervisor.extensions(user), [user.id])
  const disputes = useApi(() => api.supervisor.disputes(user), [user.id])
  const [reviewExt, setReviewExt] = useState<ExtensionRow | null>(null)
  const [decide, setDecide] = useState<DisputeRow | null>(null)

  const pending = (ext.data ?? []).filter((x) => x.status === 'pending')
  const reviewed = (ext.data ?? []).filter((x) => x.status !== 'pending')
  const loading = tab === 'disputes' ? disputes.initialLoading : ext.initialLoading
  const err = tab === 'disputes' ? disputes.error : ext.error

  return (
    <div>
      <PageHeader title="Extensions & disputes" description="Every decision requires a written reason and is recorded in the audit trail." />
      <Card>
        <Tabs
          label="Review views"
          className="px-3"
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          tabs={[
            { id: 'pending', label: 'Pending extensions', count: pending.length },
            { id: 'reviewed', label: 'Reviewed extensions', count: reviewed.length },
            { id: 'disputes', label: 'Disputed resolutions', count: (disputes.data ?? []).filter((d) => d.reopenDecision === 'pending').length },
          ]}
        />
        {err ? (
          <div className="p-4">
            <ErrorState message={err} onRetry={tab === 'disputes' ? disputes.reload : ext.reload} />
          </div>
        ) : loading ? (
          <div className="p-4">
            <LoadingBlock rows={5} />
          </div>
        ) : tab !== 'disputes' ? (
          (tab === 'pending' ? pending : reviewed).length === 0 ? (
            <EmptyState icon={<CalendarClock className="size-6" />} title={tab === 'pending' ? 'No extension requests waiting' : 'No reviewed requests yet'} />
          ) : (
            <ul className="divide-y divide-line">
              {(tab === 'pending' ? pending : reviewed).map((x) => (
                <li key={x.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <ReportRef report={x.report} />
                    <p className="text-sm">
                      <strong>{DEADLINE_KIND_LABEL[x.deadlineKind]}</strong>: {formatDateTime(x.currentDeadline)} → <strong>{formatDateTime(x.requestedDeadline)}</strong>
                    </p>
                    <p className="text-sm text-ink-soft">“{x.reason}”</p>
                    <p className="text-xs text-ink-muted">
                      Requested by {x.requestedByName} · {formatDateTime(x.createdAt)}
                    </p>
                    {x.status !== 'pending' && (
                      <p className="text-xs text-ink-soft">
                        <Badge tone={x.status === 'approved' ? 'green' : 'gray'}>{x.status}</Badge> by {x.reviewedByName ?? getUser(x.reviewedBy)?.displayName} — {x.reviewReason}
                      </p>
                    )}
                  </div>
                  {x.status === 'pending' && (
                    <Button size="sm" onClick={() => setReviewExt(x)} className="shrink-0">
                      Review
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : (disputes.data ?? []).length === 0 ? (
          <EmptyState icon={<MessageSquareWarning className="size-6" />} title="No disputed resolutions" />
        ) : (
          <ul className="divide-y divide-line">
            {(disputes.data ?? []).map((d) => (
              <li key={d.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <ReportRef report={d.report} />
                  <div className="flex items-center gap-2">
                    <StarRating value={d.rating} readOnly />
                    <Badge tone={d.reopenDecision === 'pending' ? 'orange' : d.reopenDecision === 'approved' ? 'amber' : 'gray'}>
                      {d.reopenDecision === 'pending' ? 'Awaiting decision' : `Reopen ${d.reopenDecision}`}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-soft">“{d.comment}”</p>
                  <p className="text-xs text-ink-muted">Submitted {formatDateTime(d.createdAt)}</p>
                  {d.decisionReason && <p className="text-xs text-ink-soft">Decision: {d.decisionReason}</p>}
                </div>
                {d.reopenDecision === 'pending' && (
                  <Button size="sm" onClick={() => setDecide(d)} className="shrink-0">
                    Decide
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ExtensionReviewDialog ext={reviewExt} user={user} onClose={() => setReviewExt(null)} />
      <DisputeDecisionDialog dispute={decide} user={user} onClose={() => setDecide(null)} />
    </div>
  )
}
