import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { ACCEPTED_IMAGE_TYPES, compressImage, validateImage } from '@/lib/image'

interface PhotoInputProps {
  value: string | null
  onChange: (dataUrl: string | null) => void
  error?: string
  label?: string
  hint?: string
  required?: boolean
}

/** Image picker with type/size validation, preview and client-side downscaling. */
export function PhotoInput({ value, onChange, error, label = 'Photo', hint = 'JPEG, PNG or WebP, up to 5 MB.', required }: PhotoInputProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const shownError = localError ?? error

  const handle = async (file: File | undefined) => {
    if (!file) return
    const problem = validateImage(file)
    if (problem) {
      setLocalError(problem)
      return
    }
    setBusy(true)
    setLocalError(null)
    try {
      const { dataUrl } = await compressImage(file)
      setFileName(file.name)
      onChange(dataUrl)
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not process this image.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <p id={`${id}-label`} className="mb-1.5 text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
      </p>
      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-line bg-canvas">
          <img src={value} alt="Selected photo preview" className="max-h-72 w-full object-contain" />
          <div className="flex items-center justify-between gap-2 border-t border-line bg-surface px-3 py-2 text-sm">
            <span className="truncate text-ink-soft">{fileName ?? 'Selected photo'}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => inputRef.current?.click()} className="rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50">
                Replace
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(null)
                  setFileName(null)
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="size-3.5" aria-hidden /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void handle(e.dataTransfer.files[0])
          }}
          aria-describedby={`${id}-hint`}
          aria-labelledby={`${id}-label`}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-canvas/50 px-4 py-8 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40',
            shownError ? 'border-red-300' : 'border-line',
          )}
        >
          {busy ? <Loader2 className="size-7 animate-spin text-brand-600" aria-hidden /> : <ImagePlus className="size-7 text-ink-muted" aria-hidden />}
          <span className="text-sm font-medium text-ink">{busy ? 'Processing photo…' : 'Click to choose a photo, or drag it here'}</span>
          <span id={`${id}-hint`} className="text-xs text-ink-muted">
            {hint}
          </span>
        </button>
      )}
      <input ref={inputRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void handle(e.target.files?.[0])} />
      {shownError && <p className="mt-1.5 text-sm text-red-600">{shownError}</p>}
    </div>
  )
}
