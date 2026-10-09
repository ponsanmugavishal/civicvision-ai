import { Check, Sparkles, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useCurrentUser } from '@/context/AuthContext'
import { cn } from '@/lib/cn'
import { CATEGORY_META, SEVERITY_META } from '@/lib/domain'
import { api, errorMessage } from '@/services'
import type { AiClassifyResult, IssueCategory } from '@/types'
import { CategoryIcon } from './Badges'

interface Props {
  photo: string | null
  category: IssueCategory | null
  onUse: (category: IssueCategory, suggestionId: string) => void
  onSuggestion: (suggestionId: string | null) => void
}

/**
 * Optional photo-based category suggestion from a pretrained model (Gemini API, via the backend).
 * The citizen always confirms the category; nothing is applied automatically, and failures are shown as-is.
 */
export function AiSuggestionPanel({ photo, category, onUse, onSuggestion }: Props) {
  const user = useCurrentUser()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [result, setResult] = useState<AiClassifyResult | null>(null)

  // A new photo invalidates the previous suggestion.
  useEffect(() => {
    setState('idle')
    setResult(null)
    onSuggestion(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo])

  const run = async () => {
    if (!photo) return
    setState('loading')
    try {
      const r = await api.ai.classify(user, photo)
      setResult(r)
      onSuggestion(r.suggestion?.id ?? null)
    } catch (e) {
      setResult({ available: false, message: errorMessage(e), suggestion: null })
      onSuggestion(null)
    } finally {
      setState('done')
    }
  }

  const s = result?.suggestion
  return (
    <div className="rounded-lg border border-dashed border-line bg-canvas/60 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium text-ink">
          <Sparkles className="size-4 text-brand-700" aria-hidden />
          AI category suggestion <span className="font-normal text-ink-muted">(optional)</span>
        </p>
        {!s && (
          <Button size="sm" variant="secondary" onClick={run} loading={state === 'loading'} disabled={!photo}>
            {photo ? 'Suggest from photo' : 'Add a photo first'}
          </Button>
        )}
      </div>
      {state === 'done' && result && !s && <p className="mt-2 text-ink-muted">{result.message}</p>}
      {s && (
        <div className="mt-3 space-y-2" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 font-medium shadow-card">
              <CategoryIcon category={s.suggestedCategory} />
              {CATEGORY_META[s.suggestedCategory].label}
            </span>
            {s.suggestedSeverity && <span className="text-xs text-ink-muted">Tentative severity: {SEVERITY_META[s.suggestedSeverity].label} (staff decide)</span>}
          </div>
          <p className="text-ink-soft">{s.explanation}</p>
          {s.visibleIndicators.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {s.visibleIndicators.map((v) => (
                <li key={v} className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink-soft ring-1 ring-line">
                  {v}
                </li>
              ))}
            </ul>
          )}
          {s.uncertaintyWarning && (
            <p className="flex items-start gap-1.5 text-xs text-orange-700">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {s.uncertaintyWarning}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" variant={category === s.suggestedCategory ? 'success' : 'primary'} icon={<Check className="size-4" />} onClick={() => onUse(s.suggestedCategory, s.id)}>
              {category === s.suggestedCategory ? 'Category selected' : 'Use this category'}
            </Button>
            <span className={cn('text-xs text-ink-muted')}>
              Suggested by a pretrained model ({s.model}). It can be wrong — check before submitting.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
