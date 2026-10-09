import { AlarmClock, CheckCircle2, CircleHelp, Clock, Construction, Droplets, Gauge, Trash2, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { CATEGORY_META, DEADLINE_KIND_LABEL, DEADLINE_META, SEVERITY_META, STATUS_META, getDeadlineInfo, type DeadlineInfo } from '@/lib/domain'
import { formatDuration } from '@/lib/format'
import type { IssueCategory, PublicReport, Report, ReportStatus, Severity } from '@/types'

const CATEGORY_ICON = { garbage: Trash2, drainage: Droplets, pothole: Construction, other: CircleHelp }

export function CategoryIcon({ category, className }: { category: IssueCategory; className?: string }) {
  const Icon = CATEGORY_ICON[category]
  return <Icon className={cn('size-4', className)} style={{ color: CATEGORY_META[category].color }} aria-hidden />
}

export function CategoryLabel({ category, className }: { category: IssueCategory; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium text-ink', className)}>
      <CategoryIcon category={category} />
      {CATEGORY_META[category].short}
    </span>
  )
}

export function StatusBadge({ status }: { status: ReportStatus }) {
  const m = STATUS_META[status]
  return (
    <Badge tone={m.tone} title={m.description} icon={status === 'resolved' ? <CheckCircle2 className="size-3" aria-hidden /> : undefined}>
      {m.label}
    </Badge>
  )
}

/** Severity uses a filled bar glyph so it reads differently from the clock-based deadline badge. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const m = SEVERITY_META[severity]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-ink" title={`Severity: ${m.label}`}>
      <Gauge className="size-3.5" style={{ color: m.color }} aria-hidden />
      <span className="flex gap-px" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="h-2.5 w-1 rounded-sm" style={{ background: i <= m.rank ? m.color : '#e4e7ec' }} />
        ))}
      </span>
      <span>
        <span className="sr-only">Severity </span>
        {m.label}
      </span>
    </span>
  )
}

export function DeadlineBadge({ report, info: given, compact }: { report: Report | PublicReport; info?: DeadlineInfo; compact?: boolean }) {
  const info = given ?? getDeadlineInfo(report)
  const m = DEADLINE_META[info.state]
  const Icon = info.state === 'overdue' ? TriangleAlert : info.state === 'approaching' ? AlarmClock : info.state === 'met' ? CheckCircle2 : Clock
  let text: string = m.label
  if (!compact && info.msRemaining !== null && info.kind) {
    if (info.state === 'overdue') text = `Overdue ${formatDuration(info.msRemaining)}`
    else if (info.state === 'approaching' || info.state === 'on_track') text = `${formatDuration(info.msRemaining)} left`
  }
  const title = info.kind ? `${DEADLINE_KIND_LABEL[info.kind]} target · ${m.label}` : m.label
  return (
    <Badge tone={m.tone} title={title} icon={<Icon className="size-3" aria-hidden />}>
      <span className="sr-only">Deadline: </span>
      {text}
    </Badge>
  )
}
