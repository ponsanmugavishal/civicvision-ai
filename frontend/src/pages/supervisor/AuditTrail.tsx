import { ScrollText, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/Layout'
import { useCurrentUser } from '@/context/AuthContext'
import { getUser } from '@/data/directory'
import { useApi } from '@/hooks/useApi'
import { ROLE_LABEL } from '@/lib/domain'
import { formatDateTime } from '@/lib/format'
import { api } from '@/services'
import type { AuditLogEntry } from '@/types'

const ENTITY_TONE: Record<AuditLogEntry['entityType'], 'blue' | 'violet' | 'teal' | 'orange' | 'red' | 'amber' | 'gray'> = {
  report: 'blue',
  assignment: 'violet',
  evidence: 'teal',
  extension: 'orange',
  escalation: 'red',
  feedback: 'amber',
  profile: 'gray',
}

const PAGE = 50

export default function AuditTrail() {
  const user = useCurrentUser()
  const [entity, setEntity] = useState<AuditLogEntry['entityType'] | ''>('')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const { data, error, initialLoading, reload } = useApi(() => api.supervisor.audit(user, { entityType: entity || undefined, limit: 2000 }), [user.id, entity])

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    return (data ?? []).filter((a) => !query || `${a.summary} ${a.action} ${a.actorName ?? getUser(a.actorId)?.displayName ?? ''}`.toLowerCase().includes(query))
  }, [data, q])

  return (
    <div>
      <PageHeader title="Audit trail" description="Append-only record of important actions. Entries cannot be edited or deleted through the application." />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-4">
          <label className="relative min-w-60 flex-1">
            <span className="sr-only">Search audit log</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <Input
              type="search"
              className="pl-9"
              placeholder="Search by complaint ID, action or person…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setLimit(PAGE)
              }}
            />
          </label>
          <label className="w-full sm:w-48">
            <span className="sr-only">Entity type</span>
            <Select
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value as AuditLogEntry['entityType'] | '')
                setLimit(PAGE)
              }}
            >
              <option value="">All entity types</option>
              {Object.keys(ENTITY_TONE).map((k) => (
                <option key={k} value={k}>
                  {k[0].toUpperCase() + k.slice(1)}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : initialLoading ? (
          <div className="p-4">
            <LoadingBlock rows={8} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<ScrollText className="size-6" />} title="No audit entries match" />
        ) : (
          <>
            <ol className="divide-y divide-line">
              {rows.slice(0, limit).map((a) => {
                const actor = a.actorId === 'system' ? 'Automated deadline check' : (a.actorName ?? getUser(a.actorId)?.displayName ?? 'Unknown user')
                return (
                  <li key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                    <time dateTime={a.createdAt} className="w-44 shrink-0 text-xs text-ink-muted tabular-nums">
                      {formatDateTime(a.createdAt)}
                    </time>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink">{a.summary}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        <Badge tone={ENTITY_TONE[a.entityType]}>{a.action}</Badge>
                        <span>
                          {actor}
                          {a.actorId !== 'system' && ` · ${ROLE_LABEL[a.actorRole]}`}
                        </span>
                        {a.reportId && (
                          <Link to={`/supervisor/reports/${a.reportId}`} className="text-brand-700 hover:underline">
                            Open complaint
                          </Link>
                        )}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-ink-muted">
              <span>
                Showing {Math.min(limit, rows.length)} of {rows.length}
              </span>
              {limit < rows.length && (
                <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setLimit((l) => l + PAGE)}>
                  Load more
                </button>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
