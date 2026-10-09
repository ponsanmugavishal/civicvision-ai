import { FlaskConical, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { useToast } from '@/context/ToastContext'
import { useDataVersion } from '@/hooks/useApi'
import { getPersistWarning, resetDemoData } from '@/services/mock/store'

/** Persistent notice that the app is running on browser-only sample data. */
export function DemoBanner() {
  useDataVersion()
  const [confirm, setConfirm] = useState(false)
  const { toast } = useToast()
  const warning = getPersistWarning()

  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs sm:px-6">
        <FlaskConical className="size-3.5 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">
          <strong>Demo mode.</strong>
          <span className="sm:hidden"> Fictional sample data, stored only in this browser.</span>
          <span className="hidden sm:inline"> All complaints, people and photos are fictional sample data stored only in this browser — nothing is sent to a server or any government body.</span>
          {warning && <span className="ml-1 font-semibold text-red-700">{warning}</span>}
        </p>
        <button type="button" onClick={() => setConfirm(true)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium underline-offset-2 hover:underline">
          <RotateCcw className="size-3" aria-hidden />
          Reset demo data
        </button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Reset demo data?"
        body="This discards every change made in this browser (new reports, status updates, uploads, registered demo accounts) and restores the original sample data."
        confirmLabel="Reset data"
        tone="danger"
        onConfirm={() => {
          resetDemoData()
          setConfirm(false)
          toast({ tone: 'success', title: 'Demo data restored' })
        }}
      />
    </div>
  )
}
