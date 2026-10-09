import { List, Map as MapIcon, SearchX, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CategoryIcon, DeadlineBadge, SeverityBadge, StatusBadge } from '@/components/report/Badges'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/format'
import type { PublicReport, Report } from '@/types'
import { BaseMap } from './BaseMap'
import { MapLegend } from './MapLegend'
import { ReportMarkers } from './ReportMarkers'

interface MapWorkspaceProps {
  reports: (Report | PublicReport)[] | undefined
  loading: boolean
  error: string | null
  onRetry: () => void
  filters: ReactNode
  selectedId: string | null
  onSelect: (id: string | null) => void
  detail: ReactNode
  detailTitle?: string
  className?: string
  mapLabel: string
  headerExtra?: ReactNode
}

function ListItem({ r, selected, onSelect }: { r: Report | PublicReport; selected: boolean; onSelect: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])
  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        aria-current={selected || undefined}
        className={cn('w-full border-b border-line px-4 py-3 text-left transition-colors', selected ? 'bg-brand-50 ring-2 ring-brand-600 ring-inset' : 'hover:bg-canvas')}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <CategoryIcon category={r.category} />
            <span className="font-mono text-xs font-medium text-ink">{r.publicId}</span>
          </span>
          <StatusBadge status={r.status} />
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{r.description}</p>
        <p className="mt-1 truncate text-xs text-ink-muted">
          {r.address} · {formatDate(r.reportedAt)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <SeverityBadge severity={r.severity} />
          <DeadlineBadge report={r} compact />
        </div>
      </button>
    </li>
  )
}

/**
 * Synchronised list + map + detail panel. Selecting a list row highlights and reveals its marker;
 * clicking a marker selects and scrolls to its row.
 */
export function MapWorkspace({ reports, loading, error, onRetry, filters, selectedId, onSelect, detail, detailTitle = 'Complaint details', className, mapLabel, headerExtra }: MapWorkspaceProps) {
  const [mobileView, setMobileView] = useState<'list' | 'map'>('map')
  const count = reports?.length ?? 0

  return (
    <div className={cn('relative flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card lg:flex-row', className)}>
      {/* Mobile view switch */}
      <div className="flex justify-center border-b border-line bg-canvas/60 p-2 lg:hidden">
        <div className="flex rounded-full border border-line bg-surface p-1 shadow-card" role="group" aria-label="Choose view">
          {(['map', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={mobileView === v}
              onClick={() => setMobileView(v)}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', mobileView === v ? 'bg-brand-700 text-white' : 'text-ink-soft')}
            >
              {v === 'map' ? <MapIcon className="size-3.5" aria-hidden /> : <List className="size-3.5" aria-hidden />}
              {v === 'map' ? 'Map' : `List (${count})`}
            </button>
          ))}
        </div>
      </div>
      {/* Left: filters + list */}
      <section aria-label="Complaint list and filters" className={cn('flex min-h-0 w-full flex-col border-line lg:w-[400px] lg:shrink-0 lg:border-r', mobileView === 'map' ? 'hidden lg:flex' : 'flex flex-1')}>
        <div className="max-h-[55%] overflow-y-auto border-b border-line p-4 lg:max-h-none lg:overflow-visible">{filters}</div>
        <div className="flex items-center justify-between border-b border-line bg-canvas/60 px-4 py-2 text-xs text-ink-muted">
          <span aria-live="polite">
            {loading && !reports ? 'Loading…' : <><strong className="text-ink tabular-nums">{count}</strong> {count === 1 ? 'complaint' : 'complaints'} match</>}
          </span>
          {headerExtra}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <div className="p-4">
              <ErrorState message={error} onRetry={onRetry} />
            </div>
          ) : !reports ? (
            <div className="p-4">
              <LoadingBlock rows={6} />
            </div>
          ) : reports.length === 0 ? (
            <EmptyState icon={<SearchX className="size-6" />} title="No complaints match" body="Try clearing some filters or searching for a different ID or location." />
          ) : (
            <ul>
              {reports.map((r) => (
                <ListItem
                  key={r.id}
                  r={r}
                  selected={r.id === selectedId}
                  onSelect={() => {
                    onSelect(r.id)
                    if (window.matchMedia('(max-width: 1023px)').matches) setMobileView('map')
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Right: map + detail */}
      <div className={cn('relative min-h-[420px] flex-1', mobileView === 'list' ? 'hidden lg:block' : 'block')}>
        <BaseMap label={mapLabel} fill>
          <ReportMarkers reports={reports ?? []} selectedId={selectedId} onSelect={onSelect} padRight={selectedId && window.innerWidth >= 640 ? 412 : 0} />
        </BaseMap>
        <div className="pointer-events-none absolute bottom-6 left-3 z-[1000] w-52">
          <MapLegend />
        </div>
        {selectedId && (
          <aside
            aria-label={detailTitle}
            className="absolute inset-x-0 bottom-0 z-[1001] flex max-h-[75%] flex-col rounded-t-2xl border-t border-line bg-surface shadow-pop sm:inset-x-auto sm:top-3 sm:right-3 sm:bottom-3 sm:max-h-none sm:w-[400px] sm:rounded-xl sm:border"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold">{detailTitle}</h2>
              <button type="button" onClick={() => onSelect(null)} className="rounded-md p-1 text-ink-muted hover:bg-canvas hover:text-ink" aria-label="Close details">
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{detail}</div>
          </aside>
        )}
      </div>

    </div>
  )
}
