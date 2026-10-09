import { ClipboardList, PlusCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { EMPTY_FILTERS, FilterBar, toServiceFilters, type FilterState } from '@/components/report/FilterBar'
import { ReportTable } from '@/components/report/ReportTable'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { PageHeader, Tabs } from '@/components/ui/Layout'
import { useCurrentUser } from '@/context/AuthContext'
import { useApi } from '@/hooks/useApi'
import { isActive } from '@/lib/domain'
import { matchesFilters } from '@/lib/filters'
import { api } from '@/services'

type View = 'all' | 'active' | 'resolved' | 'closed'

export default function MyReports() {
  const user = useCurrentUser()
  const [params, setParams] = useSearchParams()
  const view = (['all', 'active', 'resolved', 'closed'].includes(params.get('view') ?? '') ? params.get('view') : 'all') as View
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const { data, error, initialLoading, reload } = useApi(() => api.citizen.mine(user), [user.id])

  const filtered = useMemo(() => {
    if (!data) return []
    const f = toServiceFilters(filters)
    return data.filter((r) => {
      if (view === 'active' && !isActive(r.status)) return false
      if (view === 'resolved' && r.status !== 'resolved') return false
      if (view === 'closed' && r.status !== 'rejected') return false
      return matchesFilters(r, f)
    })
  }, [data, filters, view])

  const count = (v: View) => (data ?? []).filter((r) => (v === 'all' ? true : v === 'active' ? isActive(r.status) : v === 'resolved' ? r.status === 'resolved' : r.status === 'rejected')).length

  return (
    <div>
      <PageHeader
        title="My reports"
        description="Every complaint you've submitted, with live status and deadline tracking."
        actions={
          <ButtonLink to="/citizen/report/new" icon={<PlusCircle className="size-4" />}>
            Report an issue
          </ButtonLink>
        }
      />
      <Card>
        <Tabs
          label="Report views"
          className="px-3"
          value={view}
          onChange={(v) => setParams(v === 'all' ? {} : { view: v }, { replace: true })}
          tabs={[
            { id: 'all', label: 'All', count: count('all') },
            { id: 'active', label: 'Active', count: count('active') },
            { id: 'resolved', label: 'Resolved', count: count('resolved') },
            { id: 'closed', label: 'Rejected', count: count('closed') },
          ]}
        />
        <div className="border-b border-line p-4">
          <FilterBar value={filters} onChange={setFilters} compact />
        </div>
        {error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : initialLoading ? (
          <div className="p-4">
            <LoadingBlock rows={5} />
          </div>
        ) : (
          <ReportTable
            caption="My complaints"
            rows={filtered}
            linkTo={(r) => `/citizen/reports/${r.id}`}
            empty={
              <EmptyState
                icon={<ClipboardList className="size-6" />}
                title={data?.length ? 'No complaints match these filters' : 'You haven’t reported anything yet'}
                body={data?.length ? 'Try a different tab or clear the filters.' : 'Spotted garbage, a blocked drain or a pothole? Report it in about a minute.'}
                action={!data?.length && <ButtonLink to="/citizen/report/new">Report an issue</ButtonLink>}
              />
            }
          />
        )}
      </Card>
    </div>
  )
}
