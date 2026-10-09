import { AlarmClock, CheckCircle2, Clock, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { DEADLINE_KIND_LABEL } from '@/lib/domain'
import { formatDateTime, formatDuration } from '@/lib/format'
import type { DeadlineKind, Report } from '@/types'

function stageState(r: Report, kind: DeadlineKind, now: number) {
  const due = new Date(r.deadlines[kind]).getTime()
  const done = kind === 'acknowledgement' ? r.acknowledgedAt : kind === 'action' ? r.actionStartedAt ?? r.resolvedAt : r.resolvedAt
  if (r.status === 'rejected' && !done) return { label: 'Not applicable', tone: 'gray' as const, Icon: Clock, detail: '' }
  if (done) {
    const late = new Date(done).getTime() > due
    return { label: late ? 'Completed late' : 'Met', tone: late ? ('gray' as const) : ('green' as const), Icon: CheckCircle2, detail: `Done ${formatDateTime(done)}` }
  }
  const remaining = due - now
  if (remaining < 0) return { label: `Overdue ${formatDuration(remaining)}`, tone: 'red' as const, Icon: TriangleAlert, detail: '' }
  const window = due - new Date(r.reportedAt).getTime()
  if (remaining <= Math.max(window * 0.25, 3_600_000)) return { label: `${formatDuration(remaining)} left`, tone: 'orange' as const, Icon: AlarmClock, detail: '' }
  return { label: `${formatDuration(remaining)} left`, tone: 'slate' as const, Icon: Clock, detail: '' }
}

/** Shows all three SLA stages with their own state, plus any extension applied. */
export function DeadlinePanel({ report }: { report: Report }) {
  const now = Date.now()
  return (
    <ul className="divide-y divide-line">
      {(['acknowledgement', 'action', 'resolution'] as DeadlineKind[]).map((k) => {
        const s = stageState(report, k, now)
        const extended = report.deadlines[k] !== report.originalDeadlines[k]
        return (
          <li key={k} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
            <div>
              <p className="font-medium text-ink">{DEADLINE_KIND_LABEL[k]}</p>
              <p className="text-xs text-ink-muted">
                Target {formatDateTime(report.deadlines[k])}
                {extended && <span className="ml-1 text-orange-700">(changed from {formatDateTime(report.originalDeadlines[k])})</span>}
              </p>
              {s.detail && <p className="text-xs text-ink-muted">{s.detail}</p>}
            </div>
            <Badge tone={s.tone} icon={<s.Icon className="size-3" aria-hidden />}>
              {s.label}
            </Badge>
          </li>
        )
      })}
    </ul>
  )
}
