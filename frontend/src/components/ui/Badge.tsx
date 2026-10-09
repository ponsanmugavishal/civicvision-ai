import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { Tone } from '@/lib/domain'

const tones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  gray: 'bg-gray-100 text-gray-600 ring-gray-200',
  blue: 'bg-brand-50 text-brand-800 ring-brand-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  green: 'bg-green-50 text-green-700 ring-green-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
}

interface BadgeProps {
  tone?: Tone
  children: ReactNode
  icon?: ReactNode
  className?: string
  title?: string
}

export function Badge({ tone = 'slate', children, icon, className, title }: BadgeProps) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', tones[tone], className)}>
      {icon}
      {children}
    </span>
  )
}

export function DemoTag({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded border border-dashed border-amber-400 bg-amber-50 px-1.5 py-px text-[10px] font-semibold tracking-wide text-amber-800 uppercase', className)}>
      Demo
    </span>
  )
}
