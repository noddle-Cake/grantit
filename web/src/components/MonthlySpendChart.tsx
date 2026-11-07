import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { money, moneyCompact, parseDate } from '@/lib/format'

const monthLabel = (ym: string) => parseDate(`${ym}-01`).toLocaleDateString('en-US', { month: 'short' })

function Tip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null
  return (
    <div className="rounded-lg border border-line-2 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="text-slate-3">{parseDate(`${label}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
      <div className="mt-0.5 font-semibold tabular-nums text-slate">{money(payload[0].value)} spent</div>
    </div>
  )
}

/** Single-series monthly spend. Title names the series, so no legend. */
export function MonthlySpendChart({ data, height = 220 }: { data: { month: string; spent: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke="#eaf0f6" />
        <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={{ stroke: '#cbd6e2' }} tick={{ fill: '#7c98b6', fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tickFormatter={(v: number) => moneyCompact(v)} tickLine={false} axisLine={false} tick={{ fill: '#7c98b6', fontSize: 11 }} width={52} />
        <Tooltip content={<Tip />} cursor={{ fill: 'rgba(42,120,214,0.08)' }} />
        <Bar dataKey="spent" fill="var(--color-viz-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}
