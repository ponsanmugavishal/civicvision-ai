import { MapPinOff } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      <span className="rounded-full bg-slate-100 p-4 text-ink-muted">
        <MapPinOff className="size-7" aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-ink-muted">The page you're looking for doesn't exist or has moved.</p>
      <div className="mt-6 flex gap-2">
        <ButtonLink to="/" variant="secondary">
          Home
        </ButtonLink>
        <ButtonLink to="/map">Open civic map</ButtonLink>
      </div>
    </div>
  )
}
