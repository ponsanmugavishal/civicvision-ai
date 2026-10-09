import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { MapWorkspace } from '@/components/map/MapWorkspace'
import { EMPTY_FILTERS, FilterBar, toServiceFilters, type FilterState } from '@/components/report/FilterBar'
import { PublicReportPanel } from '@/components/report/PublicReportPanel'
import { useApi } from '@/hooks/useApi'
import { useDebounced } from '@/hooks/useDebounced'
import { CATEGORIES } from '@/lib/domain'
import { api } from '@/services'
import type { IssueCategory } from '@/types'

export default function MapExplorer() {
  const [params, setParams] = useSearchParams()
  const initialCategory = params.get('category') as IssueCategory | null
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...EMPTY_FILTERS,
    categories: initialCategory && CATEGORIES.includes(initialCategory) ? [initialCategory] : [],
    search: params.get('q') ?? '',
  }))
  const debounced = useDebounced(filters, 200)
  const serviceFilters = useMemo(() => toServiceFilters(debounced), [debounced])
  const { data, error, loading, reload } = useApi(() => api.publicReports.list(serviceFilters), [serviceFilters])
  const sorted = useMemo(() => data && [...data].sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)), [data])

  const selectedId = params.get('selected')
  const setSelected = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('selected', id)
    else next.delete('selected')
    setParams(next, { replace: true })
  }

  return (
    <div className="mx-auto max-w-[1600px] px-0 sm:px-4 sm:py-4">
      <h1 className="sr-only">Interactive civic issue map</h1>
      <MapWorkspace
        className="h-[calc(100dvh-6.5rem)] rounded-none sm:h-[calc(100dvh-8.5rem)] sm:rounded-xl"
        mapLabel="Civic issue map"
        reports={sorted}
        loading={loading}
        error={error}
        onRetry={reload}
        filters={<FilterBar value={filters} onChange={setFilters} compact showZone />}
        selectedId={selectedId}
        onSelect={setSelected}
        detail={selectedId ? <PublicReportPanel reportId={selectedId} /> : null}
      />
    </div>
  )
}
