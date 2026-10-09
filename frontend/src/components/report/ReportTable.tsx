import { ArrowDown, ArrowUp, ChevronRight, CalendarClock, ShieldAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'
import { getDeadlineInfo, SEVERITY_META } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import type { Report } from '@/types'
import type { ScopedReportRow } from '@/services'
import { CategoryIcon, DeadlineBadge, SeverityBadge, StatusBadge } from './Badges'

type SortKey = 'reported' | 'deadline' | 'severity' | 'updated'

interface ReportTableProps {
  rows: (Report | ScopedReportRow)[]
  linkTo: (r: Report) => string
  showAssignment?: boolean
  empty?: ReactNode
  defaultSort?: SortKey
  caption: string
}

const isRow = (r: Report | ScopedReportRow): r is ScopedReportRow => 'departmentName' in r

export function ReportTable({ rows, linkTo, showAssignment, empty, defaultSort = 'reported', caption }: ReportTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: defaultSort, dir: defaultSort === 'deadline' ? 'asc' : 'desc' })

  const sorted = useMemo(() => {
    const now = Date.now()
    const val = (r: Report): number => {
      switch (sort.key) {
        case 'reported':
          return new Date(r.reportedAt).getTime()
        case 'updated':
          return new Date(r.updatedAt).getTime()
        case 'severity':
          return SEVERITY_META[r.severity].rank
        case 'deadline': {
          const info = getDeadlineInfo(r, now)
          return info.msRemaining === null || info.state === 'met' || info.state === 'missed' ? Number.MAX_SAFE_INTEGER : info.msRemaining
        }
      }
    }
    return [...rows].sort((a, b) => (sort.dir === 'asc' ? val(a) - val(b) : val(b) - val(a)))
  }, [rows, sort])

  if (!rows.length) return <>{empty}</>

  const header = (key: SortKey, label: string) => {
    const active = sort.key === key
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-4 py-2.5 text-left font-medium">
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : s.key === key ? 'desc' : key === 'deadline' ? 'asc' : 'desc' }))}
          className="inline-flex items-center gap-1 hover:text-ink"
        >
          {label}
          {active && (sort.dir === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
        </button>
      </th>
    )
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-line bg-canvas/70 text-xs text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Complaint</th>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Status</th>
              {header('severity', 'Severity')}
              {header('deadline', 'Deadline')}
              {showAssignment && <th scope="col" className="px-4 py-2.5 text-left font-medium">Assigned to</th>}
              {header('reported', 'Reported')}
              <th scope="col" className="w-8 px-2" aria-label="Open" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((r) => (
              <tr key={r.id} className="group relative hover:bg-canvas/70">
                <td className="max-w-md px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CategoryIcon category={r.category} />
                    <Link to={linkTo(r)} className="font-mono text-xs font-semibold text-ink after:absolute after:inset-0 hover:text-brand-700">
                      {r.publicId}
                    </Link>
                    {isRow(r) && r.openEscalations > 0 && (
                      <span title={`${r.openEscalations} open escalation(s)`} className="relative z-10 text-red-600">
                        <ShieldAlert className="size-3.5" aria-label="Escalated" />
                      </span>
                    )}
                    {isRow(r) && r.pendingExtension && (
                      <span title="Extension request pending" className="relative z-10 text-orange-600">
                        <CalendarClock className="size-3.5" aria-label="Extension pending" />
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-ink-soft">{r.description}</p>
                  <p className="truncate text-xs text-ink-muted">{r.address}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3">
                  <SeverityBadge severity={r.severity} />
                </td>
                <td className="px-4 py-3">
                  <DeadlineBadge report={r} />
                </td>
                {showAssignment && (
                  <td className="px-4 py-3 text-xs">
                    {isRow(r) ? (
                      <>
                        <span className="block text-ink">{r.assignedStaffName ?? <span className="text-ink-muted">Unassigned</span>}</span>
                        <span className="block text-ink-muted">
                          {r.departmentName ?? '—'} · {r.zoneName ?? '—'}
                        </span>
                      </>
                    ) : null}
                  </td>
                )}
                <td className="px-4 py-3 text-xs whitespace-nowrap text-ink-muted">{formatDate(r.reportedAt)}</td>
                <td className="px-2 py-3 text-ink-muted">
                  <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-line md:hidden">
        {sorted.map((r) => (
          <li key={r.id}>
            <Link to={linkTo(r)} className={cn('block px-4 py-3 hover:bg-canvas')}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <CategoryIcon category={r.category} />
                  <span className="font-mono text-xs font-semibold">{r.publicId}</span>
                </span>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{r.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <SeverityBadge severity={r.severity} />
                <DeadlineBadge report={r} />
                {showAssignment && isRow(r) && <span className="text-xs text-ink-muted">{r.assignedStaffName ?? 'Unassigned'}</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
