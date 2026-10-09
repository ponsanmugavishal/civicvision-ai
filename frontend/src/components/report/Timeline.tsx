import { ArrowRightLeft, CalendarClock, Camera, CheckCircle2, CircleDot, Lock, MessageSquare, Star, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import type { TimelineEntry } from '@/types'
import { EmptyState } from '@/components/ui/Feedback'

const ICONS = {
  status: CircleDot,
  evidence: Camera,
  note: MessageSquare,
  assignment: ArrowRightLeft,
  extension: CalendarClock,
  escalation: TriangleAlert,
  feedback: Star,
}

export function Timeline({ entries, newestFirst = false }: { entries: TimelineEntry[]; newestFirst?: boolean }) {
  if (!entries.length) return <EmptyState title="No activity yet" />
  const list = newestFirst ? [...entries].reverse() : entries
  return (
    <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-line">
      {list.map((e) => {
        const Icon = e.status === 'resolved' ? CheckCircle2 : e.internal ? Lock : ICONS[e.kind]
        return (
          <li key={e.id} className="relative flex gap-3">
            <span
              className={cn(
                'relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-surface',
                e.kind === 'escalation' ? 'border-red-200 text-red-600' : e.status === 'resolved' ? 'border-green-200 text-green-600' : e.internal ? 'border-amber-200 text-amber-700' : 'border-line text-ink-muted',
              )}
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="text-sm font-medium text-ink">{e.title}</p>
                {e.internal && <span className="text-[11px] font-semibold text-amber-700 uppercase">Internal only</span>}
              </div>
              {e.detail && <p className="mt-0.5 text-sm break-words text-ink-soft">{e.detail}</p>}
              <p className="mt-0.5 text-xs text-ink-muted">
                {e.actorLabel} · <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time>
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
