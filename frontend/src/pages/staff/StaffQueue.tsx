import { ListChecks } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { EMPTY_FILTERS, FilterBar, toServiceFilters, type FilterState } from '@/components/report/FilterBar'
import { ReportTable } from '@/components/report/ReportTable'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { PageHeader, Tabs } from '@/components/ui/Layout'
import { useCurrentUser } from '@/context/AuthContext'
import { useApi } from '@/hooks/useApi'
import { useDebounced } from '@/hooks/useDebounced'
import { isActive } from '@/lib/domain'
import { api, type ScopedReportRow } from '@/services'

type Tab = 'mine' | 'unclaimed' | 'scope' | 'closed'

const TAB_FILTER: Record<Tab, (r: ScopedReportRow, uid: string) => boolean> = {
  mine: (r, uid) => r.assignedStaffId === uid && isActive(r.status),
  unclaimed: (r) => r.status === 'open' && !r.assignedStaffId,
  scope: (r) => isActive(r.status),
  closed: (r) => !isActive(r.status),
}

export default function StaffQueue() {
  const user = useCurrentUser()
  const [params, setParams] = useSearchParams()
  const tab = (Object.keys(TAB_FILTER).includes(params.get('tab') ?? '') ? params.get('tab') : 'mine') as Tab
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const debounced = useDebounced(filters, 200)
  const sf = useMemo(() => toServiceFilters(debounced), [debounced])
  const { data, error, initialLoading, reload } = useApi(() => api.work.list(user, sf), [user.id, sf])

  const rows = useMemo(() => (data ?? []).filter((r) => TAB_FILTER[tab](r, user.id)), [data, tab, user.id])
  const count = (t: Tab) => (data ?? []).filter((r) => TAB_FILTER[t](r, user.id)).length

  return (
    <div>
      <PageHeader title="Work queue" description="Only complaints within your department and authorised zones are listed. Sort by deadline to work the most urgent first." />
      <Card>
        <Tabs
          label="Queue views"
          className="px-3"
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          tabs={[
            { id: 'mine', label: 'Assigned to me', count: count('mine') },
            { id: 'unclaimed', label: 'Unclaimed', count: count('unclaimed') },
            { id: 'scope', label: 'All active in scope', count: count('scope') },
            { id: 'closed', label: 'Resolved & rejected', count: count('closed') },
          ]}
        />
        <div className="border-b border-line p-4">
          <FilterBar value={filters} onChange={setFilters} compact showZone={user.zoneIds.length !== 1} />
        </div>
        {error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : initialLoading ? (
          <div className="p-4">
            <LoadingBlock rows={6} />
          </div>
        ) : (
          <ReportTable
            caption="Work queue"
            rows={rows}
            showAssignment
            defaultSort={tab === 'closed' ? 'updated' : 'deadline'}
            linkTo={(r) => `/staff/reports/${r.id}`}
            empty={<EmptyState icon={<ListChecks className="size-6" />} title="No complaints in this view" body="Try another tab or clear the filters." />}
          />
        )}
      </Card>
    </div>
  )
}
