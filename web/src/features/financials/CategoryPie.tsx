import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { CategoryRow } from '@grantit/shared/financials'
import { money, pct } from '@grantit/shared/format'

const CATEGORY_HUES = 8
/** Categorical palette cycling --color-cat-1..8; the legend carries the same index as the slice. */
export const categoryColor = (index: number) => `var(--color-cat-${(index % CATEGORY_HUES) + 1})`

interface Segment {
  categoryId: string
  name: string
  part: 'spent' | 'remaining'
  value: number
  color: string
  fillOpacity: number
  spent: number
  available: number
  remaining: number
  overspent: number
}

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Segment }[] }) {
  if (!active || !payload?.length) return null
  const s = payload[0].payload
  return (
    <div className="rounded-lg border border-line-2 bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="text-slate-3">{s.name}</div>
      <div className="mt-0.5 font-semibold tabular-nums text-slate">
        Spent {money(s.spent)} of {money(s.available)} ({pct(s.available ? s.spent / s.available : 0)})
      </div>
      <div className="mt-0.5 tabular-nums text-slate-2">{money(s.remaining)} remaining</div>
      {s.overspent > 0 && <div className="mt-0.5 font-medium text-bad">{money(s.overspent)} over</div>}
    </div>
  )
}

/**
 * One slice per category, sized by the money it makes available. Each slice is two adjacent
 * segments in one hue: the full-color part is what has been spent, the pale part is what remains.
 */
export function CategoryPie({ categories, onSelect }: { categories: CategoryRow[]; onSelect: (categoryId: string) => void }) {
  const segments: Segment[] = categories.flatMap((c, i) => {
    if (c.available <= 0) return []
    const base = { categoryId: c.id, name: c.name, color: categoryColor(i), spent: c.spent, available: c.available, remaining: c.remaining, overspent: c.overspent }
    const parts: Segment[] = []
    if (c.available - c.remaining > 0) parts.push({ ...base, part: 'spent' as const, value: c.available - c.remaining, fillOpacity: 1 })
    if (c.remaining > 0) parts.push({ ...base, part: 'remaining' as const, value: c.remaining, fillOpacity: 0.3 })
    return parts
  })
  return (
    <div className="h-[min(70vh,34rem)] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={segments}
            dataKey="value"
            nameKey="name"
            startAngle={90}
            endAngle={-270}
            outerRadius="100%"
            stroke="var(--color-surface)"
            strokeWidth={2}
            isAnimationActive={false}
            className="cursor-pointer"
            onClick={(data) => {
              const seg = (data.payload ?? data) as Segment
              if (seg.categoryId) onSelect(seg.categoryId)
            }}
          >
            {segments.map((s) => <Cell key={`${s.categoryId}-${s.part}`} fill={s.color} fillOpacity={s.fillOpacity} />)}
          </Pie>
          <Tooltip content={<Tip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
