import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

type AlertTone = 'info' | 'success' | 'warning' | 'error'

const alertTone: Record<AlertTone, { cls: string; Icon: typeof Info }> = {
  info: { cls: 'border-brand-200 bg-brand-50 text-brand-900', Icon: Info },
  success: { cls: 'border-green-200 bg-green-50 text-green-900', Icon: CheckCircle2 },
  warning: { cls: 'border-orange-200 bg-orange-50 text-orange-900', Icon: AlertTriangle },
  error: { cls: 'border-red-200 bg-red-50 text-red-900', Icon: XCircle },
}

export function Alert({ tone = 'info', title, children, className, action }: { tone?: AlertTone; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  const { cls, Icon } = alertTone[tone]
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={cn('flex gap-3 rounded-lg border px-3.5 py-3 text-sm', cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} aria-hidden />
}

export function LoadingBlock({ rows = 4, label = 'Loading…' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 p-1">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('h-10', i % 2 ? 'w-11/12' : 'w-full')} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 rounded-full bg-canvas p-3 text-ink-muted">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert tone="error" title="Couldn't load this data" action={onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}>
      {message}
    </Alert>
  )
}
