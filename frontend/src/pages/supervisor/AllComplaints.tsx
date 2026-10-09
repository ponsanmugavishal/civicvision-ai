import { List, Map as MapIcon, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MapWorkspace } from '@/components/map/MapWorkspace'
import { EMPTY_FILTERS, FilterBar, toServiceFilters, type FilterState } from '@/components/report/FilterBar'
import { ReportTable } from '@/components/report/ReportTable'
import { WorkSummaryPanel } from '@/components/report/WorkSummaryPanel'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { PageHeader } from '@/components/ui/Layout'
import { useCurrentUser } from '@/context/AuthContext'
import { useApi } from '@/hooks/useApi'
import { useDebounced } from '@/hooks/useDebounced'
import { cn } from '@/lib/cn'
import { api } from '@/services'

export default function AllComplaints() {
  const user = useCurrentUser()
  const [view, setView] = useState<'table' | 'map'>('table')
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [selected, setSelected] = useState<string | null>(null)
  const debounced = useDebounced(filters, 200)
  const sf = useMemo(() => toServiceFilters(debounced), [debounced])
  const { data, error, loading, initialLoading, reload } = useApi(() => api.work.list(user, sf), [user.id, sf])
  const selectedReport = data?.find((r) => r.id === selected)

  const toggle = (
    <div className="flex rounded-lg border border-line bg-surface p-0.5 shadow-sm" role="group" aria-label="View">
      {(['table', 'map'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => setView(v)}
          className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium', view === v ? 'bg-brand-700 text-white' : 'text-ink-soft hover:text-ink')}
        >
          {v === 'table' ? <List className="size-4" aria-hidden /> : <MapIcon className="size-4" aria-hidden />}
          {v === 'table' ? 'Table' : 'Map'}
        </button>
      ))}
    </div>
  )

  return (
    <div>
      <PageHeader title="All complaints" description="Every complaint within your oversight scope. Open one to reassign, review deadlines or intervene." actions={toggle} />
      {view === 'table' ? (
        <Card>
          <div className="border-b border-line p-4">
            <FilterBar value={filters} onChange={setFilters} showDepartment showZone />
          </div>
          <div className="border-b border-line bg-canvas/60 px-4 py-2 text-xs text-ink-muted" aria-live="polite">
            <strong className="text-ink tabular-nums">{data?.length ?? 0}</strong> complaints match
          </div>
          {error ? (
            <div className="p-4">
              <ErrorState message={error} onRetry={reload} />
            </div>
          ) : initialLoading ? (
            <div className="p-4">
              <LoadingBlock rows={8} />
            </div>
          ) : (
            <ReportTable
              caption="All complaints in scope"
              rows={data ?? []}
              showAssignment
              linkTo={(r) => `/supervisor/reports/${r.id}`}
              empty={<EmptyState icon={<SearchX className="size-6" />} title="No complaints match" body="Clear some filters to see more." />}
            />
          )}
        </Card>
      ) : (
        <MapWorkspace
          className="h-[calc(100dvh-14rem)] min-h-[560px]"
          mapLabel="Supervisor complaint map"
          reports={data}
          loading={loading}
          error={error}
          onRetry={reload}
          filters={<FilterBar value={filters} onChange={setFilters} compact showDepartment showZone />}
          selectedId={selectedReport ? selected : null}
          onSelect={setSelected}
          detail={selectedReport ? <WorkSummaryPanel report={selectedReport} basePath="/supervisor/reports" /> : null}
        />
      )}
    </div>
  )
}
