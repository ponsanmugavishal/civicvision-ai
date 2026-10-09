import { AlarmClock, CalendarClock, CheckCircle2, Flame, Hourglass, MessageSquareWarning, ShieldAlert, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { DepartmentWorkloadChart, TrendChart } from '@/components/charts/Charts'
import { ReportTable } from '@/components/report/ReportTable'
import { ALL_SCOPE, ScopeFilter, scopeToFilters, type Scope } from '@/components/supervisor/ScopeFilter'
import { ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { PageHeader, StatCard } from '@/components/ui/Layout'
import { useCurrentUser } from '@/context/AuthContext'
import { useApi } from '@/hooks/useApi'
import { getDeadlineInfo } from '@/lib/domain'
import { formatDuration } from '@/lib/format'
import { api } from '@/services'

export default function SupervisorOverview() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const [scope, setScope] = useState<Scope>(ALL_SCOPE)
  const filters = useMemo(() => scopeToFilters(scope), [scope])
  const summary = useApi(() => api.analytics.summary(user, filters), [user.id, filters])
  const depts = useApi(() => api.analytics.departments(user, filters), [user.id, filters])
  const trend = useApi(() => api.analytics.trend(user, 10, filters), [user.id, filters])
  const overdue = useApi(() => api.work.list(user, { ...filters, overdueOnly: true }), [user.id, filters])

  const s = summary.data
  const topOverdue = useMemo(
    () => [...(overdue.data ?? [])].sort((a, b) => (getDeadlineInfo(a).msRemaining ?? 0) - (getDeadlineInfo(b).msRemaining ?? 0)).slice(0, 5),
    [overdue.data],
  )

  return (
    <div>
      <PageHeader
        eyebrow="Supervisor portal"
        title="Oversight overview"
        description="Deadlines, escalations and workload across the departments and zones you oversee."
        actions={<ScopeFilter value={scope} onChange={setScope} />}
      />
      {summary.error ? (
        <ErrorState message={summary.error} onRetry={summary.reload} />
      ) : !s ? (
        <LoadingBlock rows={6} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Active complaints" value={s.active} tone="blue" icon={<Hourglass className="size-5" />} onClick={() => navigate('/supervisor/complaints')} />
            <StatCard label="Overdue" value={s.overdue} tone="red" icon={<TriangleAlert className="size-5" />} onClick={() => navigate('/supervisor/queues?tab=overdue')} />
            <StatCard label="Due soon" value={s.approaching} tone="orange" icon={<AlarmClock className="size-5" />} onClick={() => navigate('/supervisor/queues?tab=approaching')} />
            <StatCard label="Critical & active" value={s.criticalActive} tone="red" icon={<Flame className="size-5" />} onClick={() => navigate('/supervisor/queues?tab=critical')} />
            <StatCard label="Open escalations" value={s.openEscalations} tone="red" icon={<ShieldAlert className="size-5" />} onClick={() => navigate('/supervisor/escalations')} />
            <StatCard label="Pending extensions" value={s.pendingExtensions} tone="orange" icon={<CalendarClock className="size-5" />} onClick={() => navigate('/supervisor/extensions')} />
            <StatCard label="Disputed resolutions" value={s.pendingDisputes} tone="orange" icon={<MessageSquareWarning className="size-5" />} onClick={() => navigate('/supervisor/extensions?tab=disputes')} />
            <StatCard
              label="Avg. time to resolve"
              value={s.avgResolutionHours !== null ? formatDuration(s.avgResolutionHours * 3_600_000) : '—'}
              tone="green"
              icon={<CheckCircle2 className="size-5" />}
              hint={s.resolvedOnTimeRate !== null ? `${Math.round(s.resolvedOnTimeRate * 100)}% resolved within target` : undefined}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Workload by department" description="Current complaint counts. Descriptive only — departments differ in workload, scope and severity mix." />
              <CardBody>{depts.data ? <DepartmentWorkloadChart data={depts.data} /> : <LoadingBlock rows={4} />}</CardBody>
            </Card>
            <Card>
              <CardHeader title="Reported vs resolved per week" description="Last 10 weeks of sample data." />
              <CardBody>{trend.data ? <TrendChart data={trend.data} /> : <LoadingBlock rows={4} />}</CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Most overdue complaints"
              action={
                <ButtonLink to="/supervisor/queues?tab=overdue" variant="ghost" size="sm">
                  Open overdue queue
                </ButtonLink>
              }
            />
            <ReportTable
              caption="Most overdue complaints"
              rows={topOverdue}
              showAssignment
              defaultSort="deadline"
              linkTo={(r) => `/supervisor/reports/${r.id}`}
              empty={<EmptyState icon={<CheckCircle2 className="size-6" />} title="Nothing overdue in this scope" />}
            />
          </Card>
        </div>
      )}
    </div>
  )
}
