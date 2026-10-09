import { ExternalLink, Layers } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useCurrentUser } from '@/context/AuthContext'
import { useDebounced } from '@/hooks/useDebounced'
import { CATEGORY_META } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { api } from '@/services'
import type { DuplicateCandidate, IssueCategory } from '@/types'
import { CategoryIcon, StatusBadge } from './Badges'

interface Props {
  latitude: number | null
  longitude: number | null
  category: IssueCategory | null
  description: string
}

/** Shows existing nearby reports of the same kind before submission. A warning only — never blocks. */
export function DuplicateWarning({ latitude, longitude, category, description }: Props) {
  const user = useCurrentUser()
  const [items, setItems] = useState<DuplicateCandidate[]>([])
  const key = useDebounced(JSON.stringify({ latitude, longitude, category, d: description.slice(0, 200) }), 600)

  useEffect(() => {
    const q = JSON.parse(key) as { latitude: number | null; longitude: number | null; category: IssueCategory | null; d: string }
    if (q.latitude === null || q.longitude === null || !q.category) {
      setItems([])
      return
    }
    let stale = false
    api.citizen
      .findDuplicates(user, { latitude: q.latitude, longitude: q.longitude, category: q.category, description: q.d })
      .then((r) => !stale && setItems(r))
      .catch(() => !stale && setItems([]))
    return () => {
      stale = true
    }
  }, [key, user])

  if (!items.length) return null
  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950" role="status">
      <p className="flex items-center gap-2 font-semibold">
        <Layers className="size-4" aria-hidden />
        {items.length === 1 ? 'A similar issue was already reported nearby' : `${items.length} similar issues were already reported nearby`}
      </p>
      <p className="mt-0.5 text-orange-900/80">If it's the same problem you can follow the existing complaint instead. If it's a separate issue, continue — your report will still be submitted.</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface/80 px-2.5 py-1.5">
            <CategoryIcon category={d.category} />
            <Link to={`/reports/${d.id}`} target="_blank" className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-brand-700 hover:underline">
              {d.publicId} <ExternalLink className="size-3" aria-hidden />
            </Link>
            <StatusBadge status={d.status} />
            <span className="text-xs text-ink-muted">
              {Math.round(d.distanceM)} m away · {CATEGORY_META[d.category].short} · {formatDate(d.reportedAt)}
            </span>
            <span className="w-full truncate text-xs text-ink-soft">{d.description}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
