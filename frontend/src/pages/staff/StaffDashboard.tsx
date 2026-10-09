import { AlarmClock, CheckCircle2, Inbox, ListChecks, Map as MapIcon, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { ReportTable } from '@/components/report/ReportTable'
import { ButtonLink } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { PageHeader, StatCard } from '@/components/ui/Layout'
import { useCurrentUser } from '@/context/AuthContext'
import { getDepartment } from '@/data/directory'
import { useApi } from '@/hooks/useApi'
import { getDeadlineInfo, isActive } from '@/lib/domain'
import { api } from '@/services'

export default function StaffDashboard() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const { data, error, initialLoading, reload } = useApi(() => api.work.list(user), [user.id])

  const s = useMemo(() => {
    const rows = data ?? []
    const now = Date.now()
    const mine = rows.filter((r) => r.assignedStaffId === user.id && isActive(r.status))
    const unclaimed = rows.filter((r) => r.status === 'open' && !r.assignedStaffId)
    const attention = rows
      .filter((r) => isActive(r.status) && (r.assignedStaffId === user.id || !r.assignedStaffId))
      .filter((r) => ['overdue', 'approaching'].includes(getDeadlineInfo(r, now).state))
    const resolved30 = rows.filter((r) => r.resolvedAt && r.assignedStaffId === user.id && now - new Date(r.resolvedAt).getTime() < 30 * 86_400_000)
    return {
      mine,
      unclaimed,
      attention,
      overdue: attention.filter((r) => getDeadlineInfo(r, now).state === 'overdue').length,
      approaching: attention.filter((r) => getDeadlineInfo(r, now).state === 'approaching').length,
      resolved30,
    }
  }, [data, user.id])

  return (
    <div>
      <PageHeader
        eyebrow={getDepartment(user.departmentId)?.name}
        title="Staff dashboard"
        description="Complaints assigned to you and unclaimed complaints in your department and zone."
        actions={
          <>
            <ButtonLink to="/staff/map" variant="secondary" icon={<MapIcon className="size-4" />}>
              Assignment map
            </ButtonLink>
            <ButtonLink to="/staff/queue" icon={<ListChecks className="size-4" />}>
              Open work queue
            </ButtonLink>
          </>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : initialLoading ? (
        <LoadingBlock rows={6} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="My active work" value={s.mine.length} tone="blue" icon={<ListChecks className="size-5" />} onClick={() => navigate('/staff/queue?tab=mine')} />
            <StatCard label="Unclaimed in scope" value={s.unclaimed.length} icon={<Inbox className="size-5" />} onClick={() => navigate('/staff/queue?tab=unclaimed')} />
            <StatCard label="Due soon" value={s.approaching} tone="orange" icon={<AlarmClock className="size-5" />} />
            <StatCard label="Overdue" value={s.overdue} tone="red" icon={<TriangleAlert className="size-5" />} />
            <StatCard label="Resolved (30 days)" value={s.resolved30.length} tone="green" icon={<CheckCircle2 className="size-5" />} />
          </div>
          <Card>
            <CardHeader title="Needs attention" description="Overdue or due-soon complaints that are yours or still unclaimed, most urgent first." />
            <ReportTable
              caption="Complaints needing attention"
              rows={s.attention}
              showAssignment
              defaultSort="deadline"
              linkTo={(r) => `/staff/reports/${r.id}`}
              empty={<EmptyState icon={<CheckCircle2 className="size-6" />} title="Nothing urgent" body="No overdue or due-soon complaints in your queue." />}
            />
          </Card>
          <Card>
            <CardHeader
              title="Unclaimed complaints"
              description="Open complaints in your scope waiting for acknowledgement."
              action={
                <ButtonLink to="/staff/queue?tab=unclaimed" variant="ghost" size="sm">
                  View all
                </ButtonLink>
              }
            />
            <ReportTable
              caption="Unclaimed complaints"
              rows={s.unclaimed.slice(0, 6)}
              defaultSort="deadline"
              linkTo={(r) => `/staff/reports/${r.id}`}
              empty={<EmptyState icon={<Inbox className="size-6" />} title="No unclaimed complaints" />}
            />
          </Card>
        </div>
      )}
    </div>
  )
}
