import { ExternalLink } from 'lucide-react'
import { DemoTag } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { useApi } from '@/hooks/useApi'
import { api } from '@/services'
import { CategoryIcon } from './Badges'
import { EvidenceGallery } from './EvidenceGallery'
import { ReportFacts } from './ReportFacts'
import { Timeline } from './Timeline'
import { CATEGORY_META } from '@/lib/domain'

/** Public-safe complaint details for the map side panel. Shows no reporter identity or internal notes. */
export function PublicReportPanel({ reportId }: { reportId: string }) {
  const { data, error, initialLoading, reload } = useApi(() => api.publicReports.get(reportId), [reportId])

  if (error) return <div className="p-4"><ErrorState message={error} onRetry={reload} /></div>
  if (initialLoading || !data) return <div className="p-4"><LoadingBlock rows={6} /></div>
  const { report, evidence, timeline } = data
  const original = evidence.filter((e) => e.type === 'original')
  const followUp = evidence.filter((e) => e.type !== 'original')

  return (
    <div className="space-y-5 p-4">
      <div>
        <div className="flex items-center gap-2">
          <CategoryIcon category={report.category} className="size-5" />
          <h3 className="font-semibold">{CATEGORY_META[report.category].label}</h3>
          {report.isDemo && <DemoTag />}
        </div>
        <p className="mt-2 text-sm text-ink-soft">{report.description}</p>
      </div>
      <ReportFacts report={report} />
      {report.resolutionSummary && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          <p className="font-semibold">Resolution summary</p>
          <p className="mt-0.5">{report.resolutionSummary}</p>
        </div>
      )}
      <section>
        <h4 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Original report photo</h4>
        <EvidenceGallery evidence={original} emptyText="No photo attached." />
      </section>
      <section>
        <h4 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Progress & resolution photos</h4>
        <EvidenceGallery evidence={followUp} emptyText="No progress or resolution photos yet." />
      </section>
      <section>
        <h4 className="mb-3 text-xs font-semibold tracking-wide text-ink-muted uppercase">Activity timeline</h4>
        <Timeline entries={timeline} newestFirst />
      </section>
      <ButtonLink to={`/reports/${report.id}`} variant="secondary" className="w-full" icon={<ExternalLink className="size-4" />}>
        Open full complaint page
      </ButtonLink>
    </div>
  )
}
