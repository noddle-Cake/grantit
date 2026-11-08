import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { money, pct } from '@grantit/shared/format'

interface Slice {
  name: string
  value: number
  color: string
}

function Tip({ active, payload, total }: { active?: boolean; payload?: { payload: Slice }[]; total: number }) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0].payload
  return (
    <div className="rounded-lg border border-line-2 bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="text-slate-3">{name}</div>
      <div className="mt-0.5 font-semibold tabular-nums text-slate">{money(value)} · {pct(total ? value / total : 0)}</div>
    </div>
  )
}

/** Total spent against total remaining, labeled beside the pie so identity never rests on color. */
export function SpentRemainingPie({ spent, remaining }: { spent: number; remaining: number }) {
  const left = Math.max(0, remaining)
  const total = spent + left
  const slices: Slice[] = [
    { name: 'Spent', value: spent, color: 'var(--color-viz-1)' },
    { name: 'Remaining', value: left, color: 'var(--color-viz-2)' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" startAngle={90} endAngle={-270} outerRadius="100%" stroke="var(--color-surface)" strokeWidth={2} isAnimationActive={false}>
              {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
            </Pie>
            <Tooltip content={<Tip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-40 flex-1 space-y-3 text-sm">
        {slices.map((s) => (
          <li key={s.name} className="flex items-start gap-2">
            <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span>
              <span className="block text-slate-2">{s.name} · {pct(total ? s.value / total : 0)}</span>
              <span className="block text-lg font-semibold tabular-nums text-slate">{money(s.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
