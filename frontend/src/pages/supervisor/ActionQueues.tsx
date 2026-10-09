import { CheckCircle2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ReportTable } from '@/components/report/ReportTable'
import { ALL_SCOPE, ScopeFilter, scopeToFilters, type Scope } from '@/components/supervisor/ScopeFilter'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { PageHeader, Tabs } from '@/components/ui/Layout'
import { useCurrentUser } from '@/context/AuthContext'
import { useApi } from '@/hooks/useApi'
import { getDeadlineInfo, isActive } from '@/lib/domain'
import { api, type ScopedReportRow } from '@/services'

type Tab = 'overdue' | 'approaching' | 'critical' | 'unassigned'

const PREDICATES: Record<Tab, (r: ScopedReportRow, now: number) => boolean> = {
  overdue: (r, now) => getDeadlineInfo(r, now).state === 'overdue',
  approaching: (r, now) => getDeadlineInfo(r, now).state === 'approaching',
  critical: (r) => r.severity === 'critical' && isActive(r.status),
  unassigned: (r) => isActive(r.status) && !r.assignedStaffId,
}

const DESCRIPTIONS: Record<Tab, string> = {
  overdue: 'Active complaints that have missed at least one response target. Each breach is recorded as an escalation.',
  approaching: 'Active complaints within the final quarter of their current target window.',
  critical: 'Active complaints rated critical severity, regardless of deadline status.',
  unassigned: 'Active complaints with no named staff member — assign them to keep work moving.',
}

export default function ActionQueues() {
  const user = useCurrentUser()
  const [params, setParams] = useSearchParams()
  const tab = (Object.keys(PREDICATES).includes(params.get('tab') ?? '') ? params.get('tab') : 'overdue') as Tab
  const [scope, setScope] = useState<Scope>(ALL_SCOPE)
  const filters = useMemo(() => scopeToFilters(scope), [scope])
  const { data, error, initialLoading, reload } = useApi(() => api.work.list(user, filters), [user.id, filters])

  const now = Date.now()
  const rows = useMemo(() => (data ?? []).filter((r) => PREDICATES[tab](r, Date.now())), [data, tab])
  const count = (t: Tab) => (data ?? []).filter((r) => PREDICATES[t](r, now)).length

  return (
    <div>
      <PageHeader title="Action queues" description="Work that needs supervisory attention. Severity and deadline status are tracked separately." actions={<ScopeFilter value={scope} onChange={setScope} />} />
      <Card>
        <Tabs
          label="Queues"
          className="px-3"
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          tabs={[
            { id: 'overdue', label: 'Overdue', count: count('overdue') },
            { id: 'approaching', label: 'Due soon', count: count('approaching') },
            { id: 'critical', label: 'Critical severity', count: count('critical') },
            { id: 'unassigned', label: 'Unassigned', count: count('unassigned') },
          ]}
        />
        <p className="border-b border-line px-4 py-2.5 text-sm text-ink-muted">{DESCRIPTIONS[tab]}</p>
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
            caption={`${tab} queue`}
            rows={rows}
            showAssignment
            defaultSort={tab === 'critical' ? 'reported' : 'deadline'}
            linkTo={(r) => `/supervisor/reports/${r.id}`}
            empty={<EmptyState icon={<CheckCircle2 className="size-6" />} title="This queue is clear" />}
          />
        )}
      </Card>
    </div>
  )
}
