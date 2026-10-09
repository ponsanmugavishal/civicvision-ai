import { Copy, MapPin } from 'lucide-react'
import type { ReactNode } from 'react'
import { getDepartment, getZone } from '@/data/directory'
import { DEADLINE_KIND_LABEL, getDeadlineInfo } from '@/lib/domain'
import { formatCoords, formatDateTime } from '@/lib/format'
import type { PublicReport, Report } from '@/types'
import { CategoryLabel, DeadlineBadge, SeverityBadge, StatusBadge } from './Badges'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  )
}

/** Key public-safe facts about a complaint. Never renders citizen identity or contact details. */
export function ReportFacts({ report, extra }: { report: Report | PublicReport; extra?: ReactNode }) {
  const info = getDeadlineInfo(report)
  return (
    <dl className="divide-y divide-line">
      <Row label="Complaint ID">
        <span className="inline-flex items-center gap-1.5 font-mono text-[13px]">
          {report.publicId}
          <button
            type="button"
            className="rounded p-0.5 text-ink-muted hover:bg-canvas hover:text-ink"
            aria-label="Copy complaint ID"
            onClick={() => void navigator.clipboard?.writeText(report.publicId).catch(() => undefined)}
          >
            <Copy className="size-3.5" />
          </button>
        </span>
      </Row>
      <Row label="Category">
        <CategoryLabel category={report.category} />
      </Row>
      <Row label="Status">
        <StatusBadge status={report.status} />
      </Row>
      <Row label="Severity">
        <SeverityBadge severity={report.severity} />
      </Row>
      <Row label="Deadline status">
        <div className="flex flex-col items-start gap-1">
          <DeadlineBadge report={report} info={info} />
          {info.kind && info.dueAt && (
            <span className="text-xs text-ink-muted">
              {DEADLINE_KIND_LABEL[info.kind]} target: {formatDateTime(info.dueAt)}
            </span>
          )}
        </div>
      </Row>
      <Row label="Department">{getDepartment(report.departmentId)?.name ?? <span className="text-ink-muted">Not yet assigned</span>}</Row>
      <Row label="Zone">{getZone(report.zoneId)?.name ?? '—'}</Row>
      <Row label="Location">
        <span className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
          <span>
            {report.address}
            {report.landmark && <span className="block text-ink-muted">{report.landmark}</span>}
            <span className="block font-mono text-xs text-ink-muted">{formatCoords(report.latitude, report.longitude)}</span>
          </span>
        </span>
      </Row>
      <Row label="Reported">{formatDateTime(report.reportedAt)}</Row>
      <Row label="Last update">{formatDateTime(report.updatedAt)}</Row>
      {report.resolvedAt && <Row label="Resolved">{formatDateTime(report.resolvedAt)}</Row>}
      {extra}
    </dl>
  )
}
