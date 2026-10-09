import { ArrowLeft, Map as MapIcon } from 'lucide-react'
import { useParams } from 'react-router'
import { BaseMap } from '@/components/map/BaseMap'
import { ReportMarkers } from '@/components/map/ReportMarkers'
import { CategoryIcon, StatusBadge } from '@/components/report/Badges'
import { EvidenceGallery } from '@/components/report/EvidenceGallery'
import { ReportFacts } from '@/components/report/ReportFacts'
import { Timeline } from '@/components/report/Timeline'
import { DemoTag } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { useApi } from '@/hooks/useApi'
import { CATEGORY_META } from '@/lib/domain'
import { api } from '@/services'

export default function PublicReportDetail() {
  const { id = '' } = useParams()
  const { data, error, initialLoading, reload } = useApi(() => api.publicReports.get(id), [id])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <ButtonLink to={`/map?selected=${id}`} variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} className="mb-4 -ml-2">
        Back to map
      </ButtonLink>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : initialLoading || !data ? (
        <LoadingBlock rows={8} />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 font-mono text-sm text-ink-muted">
                {data.report.publicId} {data.report.isDemo && <DemoTag />}
              </p>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <CategoryIcon category={data.report.category} className="size-6" />
                {CATEGORY_META[data.report.category].label}
              </h1>
              <p className="mt-2 max-w-3xl text-ink-soft">{data.report.description}</p>
            </div>
            <StatusBadge status={data.report.status} />
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="space-y-6">
              <Card>
                <CardHeader title="Complaint facts" description="Public information only — reporter identity and contact details are never shown." />
                <CardBody className="py-1">
                  <ReportFacts report={data.report} />
                </CardBody>
              </Card>
              <Card className="overflow-hidden">
                <CardHeader title="Location" icon={<MapIcon className="size-4" />} />
                <BaseMap label="Complaint location" className="h-64" center={[data.report.latitude, data.report.longitude]} zoom={16}>
                  <ReportMarkers reports={[data.report]} selectedId={data.report.id} cluster={false} />
                </BaseMap>
              </Card>
            </div>
            <div className="space-y-6">
              {data.report.resolutionSummary && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                  <p className="font-semibold">Resolution summary</p>
                  <p className="mt-1">{data.report.resolutionSummary}</p>
                </div>
              )}
              <Card>
                <CardHeader title="Photos & evidence" description="Original report photo, plus progress and resolution evidence where available." />
                <CardBody>
                  <EvidenceGallery evidence={data.evidence} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Activity timeline" />
                <CardBody>
                  <Timeline entries={data.timeline} />
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
