import { Link } from 'react-router'
import { cn } from '@/lib/cn'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#1d4ed8" />
      <path d="M16 6c-4.4 0-8 3.4-8 7.7 0 5.6 8 12.3 8 12.3s8-6.7 8-12.3C24 9.4 20.4 6 16 6z" fill="#fff" />
      <circle cx="16" cy="13.5" r="3.2" fill="#1d4ed8" />
    </svg>
  )
}

export function Logo({ to = '/', className, subtitle }: { to?: string; className?: string; subtitle?: string }) {
  return (
    <Link to={to} className={cn('flex items-center gap-2.5 rounded-lg', className)} aria-label="CIVICVISION AI home">
      <LogoMark />
      <span className="leading-tight">
        <span className="block text-[15px] font-bold tracking-tight text-ink">
          CIVICVISION <span className="text-brand-700">AI</span>
        </span>
        {subtitle && <span className="block text-[11px] font-medium text-ink-muted">{subtitle}</span>}
      </span>
    </Link>
  )
}
