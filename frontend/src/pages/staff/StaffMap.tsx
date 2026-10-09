import { useMemo, useState } from 'react'
import { MapWorkspace } from '@/components/map/MapWorkspace'
import { EMPTY_FILTERS, FilterBar, toServiceFilters, type FilterState } from '@/components/report/FilterBar'
import { WorkSummaryPanel } from '@/components/report/WorkSummaryPanel'
import { Checkbox } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/Layout'
import { useCurrentUser } from '@/context/AuthContext'
import { useApi } from '@/hooks/useApi'
import { useDebounced } from '@/hooks/useDebounced'
import { isActive } from '@/lib/domain'
import { api } from '@/services'

export default function StaffMap() {
  const user = useCurrentUser()
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [mineOnly, setMineOnly] = useState(false)
  const [activeOnly, setActiveOnly] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const debounced = useDebounced(filters, 200)
  const sf = useMemo(() => toServiceFilters(debounced), [debounced])
  const { data, error, loading, reload } = useApi(() => api.work.list(user, sf), [user.id, sf])

  const rows = useMemo(
    () => data?.filter((r) => (!mineOnly || r.assignedStaffId === user.id) && (!activeOnly || isActive(r.status))),
    [data, mineOnly, activeOnly, user.id],
  )
  const selectedReport = rows?.find((r) => r.id === selected)

  return (
    <div>
      <PageHeader title="Assignment map" description="Complaints in your department and authorised zones. Select a marker or row to see details." />
      <MapWorkspace
        className="h-[calc(100dvh-14rem)] min-h-[560px]"
        mapLabel="Staff assignment map"
        reports={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        selectedId={selectedReport ? selected : null}
        onSelect={setSelected}
        filters={
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4">
              <Checkbox label="Assigned to me" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
              <Checkbox label="Active only" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            </div>
            <FilterBar value={filters} onChange={setFilters} compact />
          </div>
        }
        detail={selectedReport ? <WorkSummaryPanel report={selectedReport} basePath="/staff/reports" /> : null}
      />
    </div>
  )
}
