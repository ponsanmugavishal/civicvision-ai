import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { LogoMark } from '@/components/Logo'
import { buttonClasses } from '@/components/ui/Button'

export function RouteError() {
  const err = useRouteError()
  const message = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : 'Unexpected error'
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark className="size-10" />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-ink-muted">{message}</p>
      <div className="flex gap-2">
        <button type="button" className={buttonClasses('secondary')} onClick={() => window.location.reload()}>
          Reload page
        </button>
        <Link to="/" className={buttonClasses('primary')}>
          Go to home
        </Link>
      </div>
    </div>
  )
}
