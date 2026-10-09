import { CheckCircle2, ClipboardList, Hourglass, PlusCircle, TriangleAlert } from 'lucide-react'
import { useNavigate } from 'react-router'
import { ReportTable } from '@/components/report/ReportTable'
import { ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { PageHeader, StatCard } from '@/components/ui/Layout'
import { useCurrentUser } from '@/context/AuthContext'
import { useApi } from '@/hooks/useApi'
import { STATUSES, STATUS_META, getDeadlineInfo, isActive } from '@/lib/domain'
import { api } from '@/services'

export default function CitizenDashboard() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const { data, error, initialLoading, reload } = useApi(() => api.citizen.mine(user), [user.id])

  const reports = data ?? []
  const active = reports.filter((r) => isActive(r.status)).length
  const resolved = reports.filter((r) => r.status === 'resolved').length
  const overdue = reports.filter((r) => getDeadlineInfo(r).state === 'overdue').length

  return (
    <div>
      <PageHeader
        eyebrow="Citizen portal"
        title={`Welcome, ${user.displayName.split(' ')[0]}`}
        description="Track the complaints you've submitted and follow every step until they're resolved."
        actions={
          <ButtonLink to="/citizen/report/new" icon={<PlusCircle className="size-4" />}>
            Report an issue
          </ButtonLink>
        }
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : initialLoading ? (
        <LoadingBlock rows={6} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total complaints" value={reports.length} icon={<ClipboardList className="size-5" />} onClick={() => navigate('/citizen/reports')} />
            <StatCard label="In progress / open" value={active} tone="blue" icon={<Hourglass className="size-5" />} onClick={() => navigate('/citizen/reports?view=active')} />
            <StatCard label="Resolved" value={resolved} tone="green" icon={<CheckCircle2 className="size-5" />} onClick={() => navigate('/citizen/reports?view=resolved')} />
            <StatCard label="Past response target" value={overdue} tone="red" icon={<TriangleAlert className="size-5" />} hint="Escalated to supervisors automatically" />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card>
              <CardHeader
                title="Recent complaints"
                action={
                  <ButtonLink to="/citizen/reports" variant="ghost" size="sm">
                    View all
                  </ButtonLink>
                }
              />
              <ReportTable
                caption="Your recent complaints"
                rows={reports.slice(0, 6)}
                linkTo={(r) => `/citizen/reports/${r.id}`}
                empty={
                  <EmptyState
                    icon={<ClipboardList className="size-6" />}
                    title="No complaints yet"
                    body="When you report an issue, it will appear here with its live status."
                    action={<ButtonLink to="/citizen/report/new">Report your first issue</ButtonLink>}
                  />
                }
              />
            </Card>
            <Card>
              <CardHeader title="Status summary" />
              <CardBody className="space-y-2.5">
                {STATUSES.map((s) => {
                  const n = reports.filter((r) => r.status === s).length
                  return (
                    <div key={s} className="flex items-center gap-3 text-sm">
                      <span className="w-24 text-ink-soft">{STATUS_META[s].label}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full rounded-full bg-brand-600" style={{ width: reports.length ? `${(n / reports.length) * 100}%` : 0 }} />
                      </span>
                      <span className="w-6 text-right tabular-nums">{n}</span>
                    </div>
                  )
                })}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
