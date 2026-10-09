import { RotateCcw, Search, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { ChipToggle } from '@/components/ui/Layout'
import { DEPARTMENTS, ZONES } from '@/data/directory'
import { cn } from '@/lib/cn'
import { CATEGORIES, CATEGORY_META, SEVERITIES, SEVERITY_META, STATUSES, STATUS_META } from '@/lib/domain'
import type { ReportFilters } from '@/types'

export type DatePreset = 'all' | '7' | '30' | '90' | 'custom'

export interface FilterState extends ReportFilters {
  datePreset: DatePreset
}

export const EMPTY_FILTERS: FilterState = { datePreset: 'all', search: '', categories: [], statuses: [], severities: [], departmentIds: [], zoneIds: [], overdueOnly: false }

/** Converts UI state (with presets) into service filters. */
export function toServiceFilters(f: FilterState): ReportFilters {
  const out: ReportFilters = { ...f }
  if (f.datePreset !== 'custom') {
    out.dateTo = undefined
    out.dateFrom = f.datePreset === 'all' ? undefined : new Date(Date.now() - Number(f.datePreset) * 86_400_000).toISOString()
  }
  return out
}

export function activeFilterCount(f: FilterState): number {
  return (
    (f.categories?.length ?? 0) +
    (f.statuses?.length ?? 0) +
    (f.severities?.length ?? 0) +
    (f.departmentIds?.length ?? 0) +
    (f.zoneIds?.length ?? 0) +
    (f.overdueOnly ? 1 : 0) +
    (f.datePreset !== 'all' ? 1 : 0) +
    (f.search?.trim() ? 1 : 0)
  )
}

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const a = arr ?? []
  return a.includes(v) ? a.filter((x) => x !== v) : [...a, v]
}

interface FilterBarProps {
  value: FilterState
  onChange: (f: FilterState) => void
  showDepartment?: boolean
  showZone?: boolean
  searchPlaceholder?: string
  compact?: boolean
  className?: string
}

export function FilterBar({ value: f, onChange, showDepartment, showZone, searchPlaceholder = 'Search by complaint ID, category or location…', compact, className }: FilterBarProps) {
  const [expanded, setExpanded] = useState(() => !compact && window.matchMedia('(min-width: 768px)').matches)
  const count = activeFilterCount(f)
  const set = (patch: Partial<FilterState>) => onChange({ ...f, ...patch })

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search complaints</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Input type="search" value={f.search ?? ''} onChange={(e) => set({ search: e.target.value })} placeholder={searchPlaceholder} className="pl-9" />
        </label>
        <Button variant="secondary" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded} icon={<SlidersHorizontal className="size-4" />}>
          <span className="hidden sm:inline">Filters</span>
          {count > 0 && <span className="rounded-full bg-brand-700 px-1.5 text-xs text-white tabular-nums">{count}</span>}
        </Button>
      </div>

      {expanded && (
        <div className="space-y-3">
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">Category</legend>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <ChipToggle key={c} active={!!f.categories?.includes(c)} onClick={() => set({ categories: toggle(f.categories, c) })} color={CATEGORY_META[c].color}>
                  {CATEGORY_META[c].short}
                </ChipToggle>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">Status</legend>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <ChipToggle key={s} active={!!f.statuses?.includes(s)} onClick={() => set({ statuses: toggle(f.statuses, s) })}>
                  {STATUS_META[s].label}
                </ChipToggle>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">Severity</legend>
            <div className="flex flex-wrap gap-1.5">
              {SEVERITIES.map((s) => (
                <ChipToggle key={s} active={!!f.severities?.includes(s)} onClick={() => set({ severities: toggle(f.severities, s) })} color={SEVERITY_META[s].color}>
                  {SEVERITY_META[s].label}
                </ChipToggle>
              ))}
            </div>
          </fieldset>

          <div className={cn('grid gap-3', compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4')}>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase">Reported</span>
              <Select value={f.datePreset} onChange={(e) => set({ datePreset: e.target.value as DatePreset })}>
                <option value="all">Any time</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="custom">Custom range…</option>
              </Select>
            </label>
            {f.datePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase">From</span>
                  <Input type="date" value={f.dateFrom?.slice(0, 10) ?? ''} max={f.dateTo || undefined} onChange={(e) => set({ dateFrom: e.target.value || undefined })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase">To</span>
                  <Input type="date" value={f.dateTo ?? ''} min={f.dateFrom?.slice(0, 10) || undefined} onChange={(e) => set({ dateTo: e.target.value || undefined })} />
                </label>
              </div>
            )}
            {showDepartment && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase">Department</span>
                <Select value={f.departmentIds?.[0] ?? ''} onChange={(e) => set({ departmentIds: e.target.value ? [e.target.value] : [] })}>
                  <option value="">All departments</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.shortName}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {showZone && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase">Zone</span>
                <Select value={f.zoneIds?.[0] ?? ''} onChange={(e) => set({ zoneIds: e.target.value ? [e.target.value] : [] })}>
                  <option value="">All zones</option>
                  {ZONES.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              aria-pressed={!!f.overdueOnly}
              onClick={() => set({ overdueOnly: !f.overdueOnly })}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                f.overdueOnly ? 'border-red-300 bg-red-50 text-red-700' : 'border-line bg-surface text-ink-soft hover:bg-canvas',
              )}
            >
              <TriangleAlert className="size-3.5" aria-hidden />
              Overdue only
            </button>
            {count > 0 && (
              <Button size="sm" variant="ghost" onClick={() => onChange(EMPTY_FILTERS)} icon={<RotateCcw className="size-3.5" />}>
                Clear filters
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
