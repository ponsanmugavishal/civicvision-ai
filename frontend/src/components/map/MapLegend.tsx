import { ChevronDown, Info } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { SEVERITY_META, SEVERITIES } from '@/lib/domain'

/** Explains the two independent encodings: severity (marker colour/size) and deadline status (corner badge). */
export function MapLegend({ className, defaultOpen = false }: { className?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={cn('pointer-events-auto rounded-lg border border-line bg-surface/95 text-xs shadow-card backdrop-blur', className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-1.5 px-3 py-2 font-semibold text-ink">
        <Info className="size-3.5 text-ink-muted" aria-hidden />
        Map legend
        <ChevronDown className={cn('ml-auto size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-line px-3 py-2.5">
          <div>
            <p className="mb-1 font-semibold text-ink-soft">Severity — marker colour & size</p>
            <ul className="space-y-1">
              {SEVERITIES.map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="inline-block rounded-full border-2 border-white shadow" style={{ background: SEVERITY_META[s].color, width: 10 + SEVERITY_META[s].rank * 2, height: 10 + SEVERITY_META[s].rank * 2 }} />
                  {SEVERITY_META[s].label}
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span className="inline-block size-3.5 rounded-full border-2 border-white bg-[#079455] shadow" />
                Resolved
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3.5 rounded-full border-2 border-white bg-[#98a2b3] shadow" />
                Rejected
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold text-ink-soft">Deadline — corner badge</p>
            <ul className="space-y-1">
              <li className="flex items-center gap-2">
                <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-[#f79009] text-[8px] text-white">◷</span>
                Due soon (approaching target)
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-[#d92d20] text-[9px] font-bold text-white">!</span>
                Overdue (pulsing ring)
              </li>
            </ul>
          </div>
          <p className="text-[11px] text-ink-muted">Numbered circles group nearby complaints; a red halo means at least one is overdue.</p>
        </div>
      )}
    </div>
  )
}
