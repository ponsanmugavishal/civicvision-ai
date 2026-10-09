/**
 * Chart components (Recharts). Colours are validated with the dataviz palette checker:
 *  - Department stack order resolved → active → overdue keeps red/green non-adjacent (CVD-safe).
 *  - Trend uses categorical slots 1 & 3; slot 3 is below 3:1 contrast, so a table view is always offered.
 */
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatShortDate } from '@/lib/format'
import type { DepartmentStats, TrendPoint } from '@/services'

export const VIZ = {
  series1: '#2a78d6',
  series3: '#1baf7a',
  good: '#0ca30c',
  critical: '#d03b3b',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
  ink: '#0b0b0b',
  ink2: '#52514e',
}

const axisTick = { fill: VIZ.muted, fontSize: 12 }

function ChartTooltip({ active, payload, label, unit = '' }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      {label && <p className="mb-1 font-semibold text-ink">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink-soft">
          <span className="size-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="font-medium text-ink tabular-nums">{p.value}{unit}</span>
        </p>
      ))}
    </div>
  )
}

function TableToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-xs font-medium text-brand-700 hover:underline">
        {open ? 'Hide data table' : 'Show data table'}
      </button>
      {open && <div className="mt-2 overflow-x-auto">{children}</div>}
    </div>
  )
}

export function DepartmentWorkloadChart({ data }: { data: DepartmentStats[] }) {
  const rows = data.map((d) => ({ name: d.name, Resolved: d.resolved, 'Active, not overdue': d.active - d.overdue, Overdue: d.overdue }))
  return (
    <div>
      <div className="h-64" role="img" aria-label="Stacked bar chart of resolved, active and overdue complaints per department">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} barCategoryGap={10}>
            <CartesianGrid horizontal={false} stroke={VIZ.grid} />
            <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={{ stroke: VIZ.axis }} tickLine={false} />
            <YAxis type="category" dataKey="name" width={96} tick={{ ...axisTick, fill: VIZ.ink2 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(16,24,40,0.04)' }} />
            <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: VIZ.ink2 }} />
            <Bar isAnimationActive={false} dataKey="Resolved" stackId="a" fill={VIZ.good} stroke="#fff" strokeWidth={2} />
            <Bar isAnimationActive={false} dataKey="Active, not overdue" stackId="a" fill={VIZ.series1} stroke="#fff" strokeWidth={2} />
            <Bar isAnimationActive={false} dataKey="Overdue" stackId="a" fill={VIZ.critical} stroke="#fff" strokeWidth={2} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableToggle>
        <table className="w-full text-xs">
          <thead className="text-ink-muted">
            <tr>
              <th className="py-1 text-left font-medium">Department</th>
              <th className="py-1 text-right font-medium">Resolved</th>
              <th className="py-1 text-right font-medium">Active, not overdue</th>
              <th className="py-1 text-right font-medium">Overdue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="py-1">{r.name}</td>
                <td className="py-1 text-right">{r.Resolved}</td>
                <td className="py-1 text-right">{r['Active, not overdue']}</td>
                <td className="py-1 text-right">{r.Overdue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </div>
  )
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const rows = data.map((p) => ({ week: formatShortDate(p.weekStart), Reported: p.reported, Resolved: p.resolved }))
  return (
    <div>
      <div className="h-64" role="img" aria-label="Line chart of complaints reported and resolved per week">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: -12, right: 16, top: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke={VIZ.grid} />
            <XAxis dataKey="week" tick={axisTick} axisLine={{ stroke: VIZ.axis }} tickLine={false} />
            <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: VIZ.axis, strokeWidth: 1 }} />
            <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 12, color: VIZ.ink2 }} />
            <Line isAnimationActive={false} type="monotone" dataKey="Reported" stroke={VIZ.series1} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
            <Line isAnimationActive={false} type="monotone" dataKey="Resolved" stroke={VIZ.series3} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <TableToggle>
        <table className="w-full text-xs">
          <thead className="text-ink-muted">
            <tr>
              <th className="py-1 text-left font-medium">Week starting</th>
              <th className="py-1 text-right font-medium">Reported</th>
              <th className="py-1 text-right font-medium">Resolved</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {rows.map((r) => (
              <tr key={r.week}>
                <td className="py-1">{r.week}</td>
                <td className="py-1 text-right">{r.Reported}</td>
                <td className="py-1 text-right">{r.Resolved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </div>
  )
}

/** Single-series horizontal bars with selective value labels (one hue, no legend needed). */
export function SimpleBarChart({ data, unit = '', label, valueFormatter = (v: number) => String(v) }: { data: { name: string; value: number }[]; unit?: string; label: string; valueFormatter?: (v: number) => string }) {
  return (
    <div className="h-56" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }} barCategoryGap={12}>
          <CartesianGrid horizontal={false} stroke={VIZ.grid} />
          <XAxis type="number" tick={axisTick} axisLine={{ stroke: VIZ.axis }} tickLine={false} />
          <YAxis type="category" dataKey="name" width={96} tick={{ ...axisTick, fill: VIZ.ink2 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: 'rgba(16,24,40,0.04)' }} />
          <Bar isAnimationActive={false} dataKey="value" name={label} fill={VIZ.series1} radius={[0, 4, 4, 0]}>
            <LabelList dataKey="value" position="right" formatter={(v: unknown) => valueFormatter(Number(v))} style={{ fill: VIZ.ink2, fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
