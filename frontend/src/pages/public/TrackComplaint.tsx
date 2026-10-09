import { FileSearch } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Field'
import { api } from '@/services'

const ID_PATTERN = /^CV-\d{4}-\d{5}$/i

export default function TrackComplaint() {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const navigate = useNavigate()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const id = value.trim().toUpperCase()
    if (!ID_PATTERN.test(id)) {
      setError('Enter a complaint ID in the format CV-2026-00012.')
      return
    }
    setPending(true)
    setError(null)
    try {
      const r = await api.publicReports.findByPublicId(id)
      if (r) navigate(`/reports/${r.id}`)
      else setError(`No complaint found with ID ${id}.`)
    } catch {
      setError('Search failed. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <div className="mb-6 text-center">
        <span className="inline-flex rounded-full bg-brand-50 p-3 text-brand-700">
          <FileSearch className="size-6" aria-hidden />
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Track a complaint</h1>
        <p className="mt-1 text-sm text-ink-muted">Enter the complaint ID you received when the report was submitted.</p>
      </div>
      <Card>
        <CardBody className="p-6">
          <form onSubmit={submit} noValidate className="space-y-4">
            <Field label="Complaint ID" error={error ?? undefined} hint="Example: CV-2026-00012" required>
              {(p) => <Input {...p} value={value} onChange={(e) => setValue(e.target.value)} placeholder="CV-2026-00012" autoComplete="off" className="font-mono uppercase" />}
            </Field>
            <Button type="submit" className="w-full" loading={pending}>
              Find complaint
            </Button>
          </form>
          <Alert className="mt-4">Public tracking shows status, timeline and evidence only. Reporter details are never displayed.</Alert>
        </CardBody>
      </Card>
    </div>
  )
}
