import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold tracking-wide text-brand-700 uppercase">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'blue' | 'green' | 'orange' | 'red'
  onClick?: () => void
}

const statTone = {
  default: 'bg-slate-100 text-slate-600',
  blue: 'bg-brand-50 text-brand-700',
  green: 'bg-green-50 text-green-700',
  orange: 'bg-orange-50 text-orange-600',
  red: 'bg-red-50 text-red-600',
}

export function StatCard({ label, value, hint, icon, tone = 'default', onClick }: StatCardProps) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left shadow-card', onClick && 'transition-colors hover:border-brand-200 hover:bg-brand-50/30')}
    >
      {icon && <span className={cn('rounded-lg p-2', statTone[tone])}>{icon}</span>}
      <div className="min-w-0">
        <p className="text-sm text-ink-muted">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
      </div>
    </Comp>
  )
}

interface TabsProps<T extends string> {
  tabs: { id: T; label: ReactNode; count?: number }[]
  value: T
  onChange: (id: T) => void
  className?: string
  label: string
}

export function Tabs<T extends string>({ tabs, value, onChange, className, label }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              const i = tabs.findIndex((x) => x.id === value)
              if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length].id)
              if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length].id)
            }}
            tabIndex={active ? 0 : -1}
            className={cn(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              active ? 'border-brand-700 text-brand-800' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn('rounded-full px-1.5 py-px text-xs tabular-nums', active ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-ink-muted')}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Segmented multi-select chips used in filter bars. */
export function ChipToggle({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
        active ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-line bg-surface text-ink-soft hover:bg-canvas',
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />}
      {children}
    </button>
  )
}
