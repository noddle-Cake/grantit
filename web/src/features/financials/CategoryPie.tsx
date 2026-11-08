import { Pie, PieChart, ResponsiveContainer, Sector, Tooltip, type PieSectorShapeProps } from 'recharts'
import type { CategoryRow } from '@grantit/shared/financials'
import { money, pct } from '@grantit/shared/format'

const CATEGORY_HUES = 8
/** Categorical palette cycling --color-cat-1..8; the legend carries the same index as the slice. */
export const categoryColor = (index: number) => `var(--color-cat-${(index % CATEGORY_HUES) + 1})`

interface Segment {
  categoryId: string
  name: string
  value: number
  color: string
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
 * A category's slice, shaded from the center out: the full-color core covers the share of the slice's area that has
 * been spent (radius ∝ √share), the pale rim is what remains.
 */
function ShadedSlice(props: PieSectorShapeProps) {
  const s = props.payload as Segment
  const geometry = { cx: props.cx, cy: props.cy, innerRadius: 0, startAngle: props.startAngle, endAngle: props.endAngle }
  const share = s.available > 0 ? Math.min(1, Math.max(0, (s.available - s.remaining) / s.available)) : 0
  return (
    <g>
      <Sector {...geometry} outerRadius={props.outerRadius} fill={s.color} fillOpacity={0.3} />
      {share > 0 && <Sector {...geometry} outerRadius={props.outerRadius * Math.sqrt(share)} fill={s.color} />}
      <Sector {...geometry} outerRadius={props.outerRadius} fill="none" stroke="var(--color-surface)" strokeWidth={2} />
    </g>
  )
}

/** One slice per category, sized by the money it makes available and shaded for what has been spent. */
export function CategoryPie({ categories, onSelect }: { categories: CategoryRow[]; onSelect: (categoryId: string) => void }) {
  const segments: Segment[] = categories.flatMap((c, i) =>
    c.available > 0 ? [{ categoryId: c.id, name: c.name, value: c.available, color: categoryColor(i), spent: c.spent, available: c.available, remaining: c.remaining, overspent: c.overspent }] : [],
  )
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
            isAnimationActive={false}
            className="cursor-pointer"
            shape={ShadedSlice}
            onClick={(data) => {
              const seg = (data.payload ?? data) as Segment
              if (seg.categoryId) onSelect(seg.categoryId)
            }}
          />
          <Tooltip content={<Tip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
