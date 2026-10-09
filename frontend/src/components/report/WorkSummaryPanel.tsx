import { ArrowRight } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { getUser } from '@/data/directory'
import type { Report } from '@/types'
import { EvidenceGallery } from './EvidenceGallery'
import { ReportFacts } from './ReportFacts'
import { useApi } from '@/hooks/useApi'
import { useCurrentUser } from '@/context/AuthContext'
import { api } from '@/services'
import { ErrorState, LoadingBlock } from '@/components/ui/Feedback'

/** Map side panel for staff/supervisor maps: key facts plus a link to the full work page. */
export function WorkSummaryPanel({ report, basePath }: { report: Report; basePath: string }) {
  const user = useCurrentUser()
  const { data, error, initialLoading, reload } = useApi(() => api.work.get(user, report.id), [report.id, user.id])
  return (
    <div className="space-y-4 p-4">
      <p className="text-sm text-ink-soft">{report.description}</p>
      <ReportFacts
        report={report}
        extra={
          <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2 text-sm">
            <dt className="text-ink-muted">Assigned to</dt>
            <dd>{getUser(report.assignedStaffId)?.displayName ?? <span className="text-ink-muted">Unassigned</span>}</dd>
          </div>
        }
      />
      {error ? <ErrorState message={error} onRetry={reload} /> : initialLoading || !data ? <LoadingBlock rows={2} /> : <EvidenceGallery evidence={data.evidence} />}
      <ButtonLink to={`${basePath}/${report.id}`} className="w-full">
        Open work page <ArrowRight className="size-4" aria-hidden />
      </ButtonLink>
    </div>
  )
}
