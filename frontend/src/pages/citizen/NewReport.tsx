import { CheckCircle2, ClipboardList, Map as MapIcon, Send } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { LocationPicker, type PickedLocation } from '@/components/map/LocationPicker'
import { AiSuggestionPanel } from '@/components/report/AiSuggestionPanel'
import { CategoryIcon } from '@/components/report/Badges'
import { DuplicateWarning } from '@/components/report/DuplicateWarning'
import { PhotoInput } from '@/components/report/PhotoInput'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Feedback'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/Layout'
import { isMockMode } from '@/config/env'
import { useCurrentUser } from '@/context/AuthContext'
import { useMutation } from '@/hooks/useApi'
import { cn } from '@/lib/cn'
import { CATEGORIES, CATEGORY_META } from '@/lib/domain'
import { api } from '@/services'
import type { IssueCategory, Report } from '@/types'

const DESC_MIN = 20
const DESC_MAX = 1000

export default function NewReport() {
  const user = useCurrentUser()
  const [category, setCategory] = useState<IssueCategory | null>(null)
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [location, setLocation] = useState<PickedLocation | null>(null)
  const [address, setAddress] = useState('')
  const [landmark, setLandmark] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [created, setCreated] = useState<Report | null>(null)
  const [aiSuggestionId, setAiSuggestionId] = useState<string | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const create = useMutation(api.citizen.create)

  /** Wraps a setter so editing a field clears its stale validation message. */
  const edit = <T,>(key: string, setter: (v: T) => void) => (v: T) => {
    setter(v)
    setErrors((e) => {
      if (!(key in e)) return e
      const { [key]: _removed, ...rest } = e
      return rest
    })
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!category) e.category = 'Choose the type of issue.'
    if (!photo) e.photo = 'Add a photo so the department can assess the issue.'
    if (!location) e.location = 'Select the location on the map or use your current location.'
    if (description.trim().length < DESC_MIN) e.description = `Describe the issue in at least ${DESC_MIN} characters.`
    if (description.length > DESC_MAX) e.description = `Keep the description under ${DESC_MAX} characters.`
    if (address.trim().length > 0 && address.trim().length < 5) e.address = 'Address looks too short.'
    return e
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) {
      requestAnimationFrame(() => summaryRef.current?.focus())
      return
    }
    const report = await create.run(user, {
      category: category!,
      description,
      latitude: location!.lat,
      longitude: location!.lng,
      address,
      landmark,
      photoDataUrl: photo!,
      aiSuggestionId,
    })
    if (report) {
      setCreated(report)
      window.scrollTo({ top: 0 })
    }
  }

  const reset = () => {
    setCreated(null)
    setCategory(null)
    setDescription('')
    setPhoto(null)
    setLocation(null)
    setAddress('')
    setLandmark('')
    setAiSuggestionId(null)
    setErrors({})
    create.reset()
  }

  if (created) {
    return (
      <div className="mx-auto max-w-xl py-8">
        <Card>
          <CardBody className="p-8 text-center">
            <span className="inline-flex rounded-full bg-green-50 p-3 text-green-600">
              <CheckCircle2 className="size-8" aria-hidden />
            </span>
            <h1 className="mt-4 text-xl font-semibold">Complaint recorded</h1>
            <p className="mt-1 text-sm text-ink-muted">Keep this ID to track progress:</p>
            <p className="mt-3 inline-block rounded-lg border border-line bg-canvas px-4 py-2 font-mono text-lg font-semibold">{created.publicId}</p>
            {isMockMode ? (
              <Alert tone="warning" className="mt-5 text-left">
                Demo mode: this complaint is saved only in your browser. It has not been sent to any department or server.
              </Alert>
            ) : (
              <Alert className="mt-5 text-left">Your complaint and photo were saved. You'll get an in-app notification as the department responds.</Alert>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <ButtonLink to={`/citizen/reports/${created.id}`} icon={<ClipboardList className="size-4" />}>
                View complaint
              </ButtonLink>
              <ButtonLink to={`/map?selected=${created.id}`} variant="secondary" icon={<MapIcon className="size-4" />}>
                See it on the map
              </ButtonLink>
              <Button variant="ghost" onClick={reset}>
                Report another issue
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  const errorList = Object.values({ ...errors, ...create.fieldErrors })

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Report an issue" description="Tell us what the problem is and where it is. Fields marked * are required." />
      <form onSubmit={submit} noValidate className="space-y-6">
        {(errorList.length > 0 || create.error) && (
          <div ref={summaryRef} tabIndex={-1} className="outline-none">
            <Alert tone="error" title="Please fix the following before submitting">
              <ul className="list-disc pl-4">
                {errorList.length ? errorList.map((m) => <li key={m}>{m}</li>) : <li>{create.error}</li>}
              </ul>
            </Alert>
          </div>
        )}

        <Card>
          <CardHeader title="1. What kind of issue is it?" />
          <CardBody>
            <fieldset>
              <legend className="sr-only">Issue category</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {CATEGORIES.map((c) => (
                  <label
                    key={c}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600',
                      category === c ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600' : 'border-line hover:bg-canvas',
                    )}
                  >
                    <input type="radio" name="category" value={c} checked={category === c} onChange={() => edit('category', setCategory)(c)} className="sr-only" />
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface shadow-card">
                      <CategoryIcon category={c} className="size-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink">{CATEGORY_META[c].label}</span>
                      <span className="block text-xs text-ink-muted">{CATEGORY_META[c].description}</span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.category && <p className="mt-2 text-sm text-red-600">{errors.category}</p>}
            </fieldset>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="2. Add a photo" />
          <CardBody className="space-y-3">
            <PhotoInput value={photo} onChange={edit('photo', setPhoto)} error={errors.photo} label="Photo of the issue" required />
            <AiSuggestionPanel
              photo={photo}
              category={category}
              onSuggestion={setAiSuggestionId}
              onUse={(c, id) => {
                edit('category', setCategory)(c)
                setAiSuggestionId(id)
              }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="3. Where is it?" />
          <CardBody className="space-y-4">
            <LocationPicker value={location} onChange={edit('location', setLocation)} error={errors.location} />
            <DuplicateWarning latitude={location?.lat ?? null} longitude={location?.lng ?? null} category={category} description={description} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Street address or area" error={errors.address} hint="Optional, but it helps field teams.">
                {(p) => <Input {...p} value={address} onChange={(e) => edit('address', setAddress)(e.target.value)} placeholder="e.g. 12, Market Street" maxLength={200} />}
              </Field>
              <Field label="Nearby landmark" hint="Optional">
                {(p) => <Input {...p} value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="e.g. Opposite the bus stop" maxLength={120} />}
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="4. Describe the problem" />
          <CardBody>
            <Field
              label="Description"
              required
              error={errors.description}
              hint={`${description.trim().length}/${DESC_MAX} characters · minimum ${DESC_MIN}. Avoid personal information about other people.`}
            >
              {(p) => (
                <Textarea
                  {...p}
                  value={description}
                  onChange={(e) => edit('description', setDescription)(e.target.value)}
                  rows={5}
                  maxLength={DESC_MAX}
                  placeholder="What is the problem, how long has it been there, and is anyone at risk?"
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <div className="flex flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center">
          <p className="text-xs text-ink-muted sm:mr-auto">
            {isMockMode ? 'Demo mode: submissions are stored only in this browser.' : 'Your photo, location and description will be public; your name and contact details will not.'}
          </p>
          <Button type="submit" size="lg" loading={create.pending} icon={<Send className="size-4" />}>
            Submit complaint
          </Button>
        </div>
      </form>
    </div>
  )
}
