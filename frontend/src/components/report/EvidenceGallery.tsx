import { ImageOff } from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import { resolveEvidenceUrl } from '@/lib/placeholder'
import type { Evidence, EvidenceType } from '@/types'

const TYPE_LABEL: Record<EvidenceType, string> = { original: 'Reported', progress: 'Progress', resolution: 'Resolution', other: 'Other' }
const TYPE_TONE: Record<EvidenceType, string> = { original: 'bg-slate-800', progress: 'bg-indigo-700', resolution: 'bg-green-700', other: 'bg-slate-600' }

export function EvidenceImage({ evidence, className }: { evidence: Evidence; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-1 bg-canvas text-xs text-ink-muted', className)}>
        <ImageOff className="size-5" aria-hidden />
        Image unavailable
      </div>
    )
  }
  return <img src={resolveEvidenceUrl(evidence.url)} alt={evidence.caption} onError={() => setFailed(true)} className={cn('object-cover', className)} loading="lazy" />
}

export function EvidenceGallery({ evidence, emptyText = 'No photos yet.' }: { evidence: Evidence[]; emptyText?: string }) {
  const [open, setOpen] = useState<Evidence | null>(null)
  if (!evidence.length) return <p className="text-sm text-ink-muted">{emptyText}</p>
  const order: EvidenceType[] = ['original', 'progress', 'resolution', 'other']
  const sorted = [...evidence].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.createdAt.localeCompare(b.createdAt))
  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {sorted.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => setOpen(e)} className="group relative block w-full overflow-hidden rounded-lg border border-line" aria-label={`View ${TYPE_LABEL[e.type].toLowerCase()} photo: ${e.caption}`}>
              <EvidenceImage evidence={e} className="aspect-[4/3] w-full transition-transform group-hover:scale-[1.03]" />
              <span className={cn('absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase', TYPE_TONE[e.type])}>{TYPE_LABEL[e.type]}</span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open ? `${TYPE_LABEL[open.type]} photo` : ''} description={open ? formatDateTime(open.createdAt) : undefined} size="lg">
        {open && (
          <figure>
            <EvidenceImage evidence={open} className="max-h-[60vh] w-full rounded-lg object-contain" />
            <figcaption className="mt-2 text-sm text-ink-soft">
              {open.caption}
              {open.isPlaceholder && <span className="mt-1 block text-xs text-amber-700">Generated demo placeholder — not a real photograph.</span>}
            </figcaption>
          </figure>
        )}
      </Dialog>
    </>
  )
}
