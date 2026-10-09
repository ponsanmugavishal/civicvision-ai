import { Info, MapPinned } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { DepartmentWorkloadChart, SimpleBarChart } from '@/components/charts/Charts'
import { BaseMap } from '@/components/map/BaseMap'
import { HotspotLayer } from '@/components/map/HotspotLayer'
import { CategoryIcon } from '@/components/report/Badges'
import { ALL_SCOPE, ScopeFilter, scopeToFilters, type Scope } from '@/components/supervisor/ScopeFilter'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { Select } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/Layout'
import { useCurrentUser } from '@/context/AuthContext'
import { useApi } from '@/hooks/useApi'
import { CATEGORIES, CATEGORY_META, SEVERITIES, SEVERITY_META } from '@/lib/domain'
import { formatDuration } from '@/lib/format'
import { api } from '@/services'
import type { IssueCategory, Severity } from '@/types'

export default function Performance() {
  const user = useCurrentUser()
  const [scope, setScope] = useState<Scope>(ALL_SCOPE)
  const [days, setDays] = useState('90')
  const [cat, setCat] = useState<IssueCategory | ''>('')
  const [sev, setSev] = useState<Severity | ''>('')
  const [selectedHotspot, setSelectedHotspot] = useState<string | null>(null)
  const filters = useMemo(
    () => ({
      ...scopeToFilters(scope),
      categories: cat ? [cat] : [],
      severities: sev ? [sev] : [],
      dateFrom: days === 'all' ? undefined : new Date(Date.now() - Number(days) * 86_400_000).toISOString(),
    }),
    [scope, days, cat, sev],
  )
  const depts = useApi(() => api.analytics.departments(user, filters), [user.id, filters])
  const summary = useApi(() => api.analytics.summary(user, filters), [user.id, filters])
  const hotspots = useApi(() => api.analytics.hotspots(user, filters), [user.id, filters])

  return (
    <div>
      <PageHeader
        title="Performance & hotspots"
        description="Descriptive metrics from the sample dataset. They show what happened, not why."
        actions={
          <>
            <label className="w-full sm:w-40">
              <span className="sr-only">Reporting period</span>
              <Select value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="all">All time</option>
              </Select>
            </label>
            <label className="w-full sm:w-36">
              <span className="sr-only">Category</span>
              <Select value={cat} onChange={(e) => setCat(e.target.value as IssueCategory | '')}>
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].short}
                  </option>
                ))}
              </Select>
            </label>
            <label className="w-full sm:w-36">
              <span className="sr-only">Severity</span>
              <Select value={sev} onChange={(e) => setSev(e.target.value as Severity | '')}>
                <option value="">All severities</option>
                {SEVERITIES.map((v) => (
                  <option key={v} value={v}>
                    {SEVERITY_META[v].label}
                  </option>
                ))}
              </Select>
            </label>
            <ScopeFilter value={scope} onChange={setScope} />
          </>
        }
      />
      <Alert className="mb-6" title="Read with care">
        Departments differ in workload, case severity, geographic scope and data completeness. These figures are not a ranking and should not be used to judge teams without that
        context.
      </Alert>

      {depts.error ? (
        <ErrorState message={depts.error} onRetry={depts.reload} />
      ) : !depts.data || !summary.data ? (
        <LoadingBlock rows={8} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Complaint status by department" />
              <CardBody>
                <DepartmentWorkloadChart data={depts.data} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Complaints by category" description="Count of complaints reported in the period." />
              <CardBody>
                <SimpleBarChart label="Complaints by category" data={CATEGORIES.map((c) => ({ name: CATEGORY_META[c].short, value: summary.data!.byCategory[c] }))} />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Department summary" description="Average time to resolve counts only complaints resolved in the period." />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Department performance summary</caption>
                <thead className="border-b border-line bg-canvas/70 text-xs text-ink-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">Department</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Total</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Active</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Overdue</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Critical active</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Resolved</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Avg. time to resolve</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Within target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {depts.data.map((d) => (
                    <tr key={d.departmentId}>
                      <th scope="row" className="px-4 py-2.5 text-left font-medium">{d.name}</th>
                      <td className="px-4 py-2.5 text-right">{d.total}</td>
                      <td className="px-4 py-2.5 text-right">{d.active}</td>
                      <td className="px-4 py-2.5 text-right">{d.overdue}</td>
                      <td className="px-4 py-2.5 text-right">{d.critical}</td>
                      <td className="px-4 py-2.5 text-right">{d.resolved}</td>
                      <td className="px-4 py-2.5 text-right">{d.avgResolutionHours !== null ? formatDuration(d.avgResolutionHours * 3_600_000) : '—'}</td>
                      <td className="px-4 py-2.5 text-right">{d.onTimeRate !== null ? `${Math.round(d.onTimeRate * 100)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Recurring-problem hotspots"
              icon={<MapPinned className="size-4" />}
              description="Clusters of 3 or more complaints within ~250 m. Circle colour: red = 3+ still active, orange = some active, blue = all closed."
            />
            {hotspots.error ? (
              <div className="p-4">
                <ErrorState message={hotspots.error} onRetry={hotspots.reload} />
              </div>
            ) : !hotspots.data ? (
              <div className="p-4">
                <LoadingBlock rows={4} />
              </div>
            ) : (
              <div className="grid lg:grid-cols-[minmax(0,1fr)_380px]">
                <BaseMap label="Hotspot map" className="h-96 lg:h-[460px]">
                  <HotspotLayer hotspots={hotspots.data} selectedId={selectedHotspot} onSelect={setSelectedHotspot} />
                </BaseMap>
                <div className="max-h-[460px] overflow-y-auto border-t border-line lg:border-t-0 lg:border-l">
                  {hotspots.data.length === 0 ? (
                    <EmptyState icon={<Info className="size-6" />} title="No hotspots in this scope" body="Try a longer period or a wider scope." />
                  ) : (
                    <ol className="divide-y divide-line">
                      {hotspots.data.map((h, i) => (
                        <li key={h.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedHotspot(h.id)}
                            aria-pressed={selectedHotspot === h.id}
                            className={`w-full px-4 py-3 text-left hover:bg-canvas ${selectedHotspot === h.id ? 'bg-brand-50' : ''}`}
                          >
                            <p className="text-sm font-medium">
                              #{i + 1} · {h.count} reports <span className="font-normal text-ink-muted">({h.activeCount} active)</span>
                            </p>
                            <p className="truncate text-xs text-ink-muted">{h.label}</p>
                            <p className="mt-1 flex flex-wrap gap-3 text-xs text-ink-soft">
                              {(Object.entries(h.categories) as [IssueCategory, number][]).map(([c, n]) => (
                                <span key={c} className="inline-flex items-center gap-1">
                                  <CategoryIcon category={c} className="size-3.5" /> {n}
                                </span>
                              ))}
                            </p>
                          </button>
                          {selectedHotspot === h.id && (
                            <ul className="flex flex-wrap gap-1.5 bg-brand-50/50 px-4 pb-3">
                              {h.reportIds.map((rid, j) => (
                                <li key={rid}>
                                  <Link to={`/supervisor/reports/${rid}`} className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-brand-700 hover:underline">
                                    {h.publicIds[j]}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
