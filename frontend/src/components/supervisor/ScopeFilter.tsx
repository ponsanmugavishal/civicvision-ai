import { Select } from '@/components/ui/Field'
import { DEPARTMENTS, ZONES } from '@/data/directory'
import type { ReportFilters } from '@/types'

export interface Scope {
  departmentId: string
  zoneId: string
}

export const ALL_SCOPE: Scope = { departmentId: '', zoneId: '' }

export function scopeToFilters(s: Scope): ReportFilters {
  return { departmentIds: s.departmentId ? [s.departmentId] : [], zoneIds: s.zoneId ? [s.zoneId] : [] }
}

/** Department + zone selectors shown in one row above supervisor dashboards. */
export function ScopeFilter({ value, onChange }: { value: Scope; onChange: (s: Scope) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <label className="w-full sm:w-52">
        <span className="sr-only">Department</span>
        <Select value={value.departmentId} onChange={(e) => onChange({ ...value, departmentId: e.target.value })}>
          <option value="">All departments</option>
          {DEPARTMENTS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.shortName}
            </option>
          ))}
        </Select>
      </label>
      <label className="w-full sm:w-44">
        <span className="sr-only">Zone</span>
        <Select value={value.zoneId} onChange={(e) => onChange({ ...value, zoneId: e.target.value })}>
          <option value="">All zones</option>
          {ZONES.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </Select>
      </label>
    </div>
  )
}
