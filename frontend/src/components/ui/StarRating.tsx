import { Star } from 'lucide-react'
import { cn } from '@/lib/cn'

const LABELS = ['Very poor', 'Poor', 'Okay', 'Good', 'Excellent']

export function StarRating({ value, onChange, readOnly }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  if (readOnly) {
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={cn('size-4', i <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} aria-hidden />
        ))}
      </span>
    )
  }
  return (
    <div role="radiogroup" aria-label="Satisfaction rating" className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i > 1 ? 's' : ''} – ${LABELS[i - 1]}`}
          onClick={() => onChange?.(i)}
          className="rounded p-0.5 hover:scale-110"
        >
          <Star className={cn('size-7 transition-colors', i <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} aria-hidden />
        </button>
      ))}
      {value > 0 && <span className="ml-2 text-sm text-ink-soft">{LABELS[value - 1]}</span>}
    </div>
  )
}
