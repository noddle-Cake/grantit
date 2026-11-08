import clsx from 'clsx'
import { ChevronRight, Search } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, EmptyState, Meter, PageHeader, Pill, Stat, StatusPill } from '@/components/ui'
import { financialsOverview, URGENT_WINDOW_DAYS, type CategoryFinancials, type CategoryGrantBalance } from '@grantit/shared/financials'
import { dateWithRelative, fmtDate, money, moneyExact, todayISO } from '@grantit/shared/format'
import { useStore } from '@/store'

const URGENCY_LABEL: Record<NonNullable<CategoryGrantBalance['urgent']>, string> = {
  both: 'Due soon · off pace',
  deadline: 'Due soon',
  projection: 'Likely unspent',
}

function SpendTip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line-2 bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="text-slate-3">{payload[0].name}</div>
      <div className="mt-0.5 font-semibold tabular-nums text-slate">{money(payload[0].value)}</div>
    </div>
  )
}

/** Spending deadline for one grant's share of a category, with its urgency and forecast. */
function GrantBalanceRow({ b }: { b: CategoryGrantBalance }) {
  return (
    <tr className="border-t border-line-2/60">
      <td className="py-2 pl-9 pr-2">
        <Link to={`/grants/${b.grantId}`} className="font-medium text-link hover:underline">{b.grantName}</Link>
        <div className="text-xs text-slate-3">{b.funder}</div>
      </td>
      <td className="py-2 text-right tabular-nums text-slate-2">{money(b.budget)}</td>
      <td className="py-2 text-right tabular-nums">{money(b.spent)}</td>
      <td className={clsx('py-2 text-right tabular-nums', b.remaining < 0 ? 'font-medium text-bad' : b.pastDeadline ? 'text-slate-3' : 'text-slate')}>
        {money(b.remaining)}
      </td>
      <td className="py-2 pl-4 pr-2 text-xs">
        <div className={clsx(b.pastDeadline ? 'text-bad' : 'text-slate-2')}>
          {b.pastDeadline ? `${fmtDate(b.spendBy)} · passed` : dateWithRelative(b.spendBy)}
        </div>
        <div className="mt-0.5 text-slate-3">
          {b.pastDeadline ? (
            b.remaining > 0 ? 'Balance can no longer be planned on' : 'Period ended'
          ) : !b.forecast ? (
            'Not enough history to project'
          ) : b.forecast.projectedRemaining > 0 ? (
            `≈${money(b.forecast.projectedRemaining)} left at deadline on current pace`
          ) : (
            `On pace to spend ${money(b.forecast.projectedSpend)} by the deadline`
          )}
        </div>
      </td>
      <td className="py-2 text-right">
        <div className="flex flex-wrap justify-end gap-1">
          {b.remaining < 0 && <StatusPill tone="bad">Over budget</StatusPill>}
          {b.pastDeadline && b.remaining > 0 && <StatusPill tone="bad">Past deadline</StatusPill>}
          {b.urgent && <StatusPill tone="warn">{URGENCY_LABEL[b.urgent]}</StatusPill>}
        </div>
      </td>
    </tr>
  )
}

/** One combined category row; expanding it lists each grant's balance with its own spend-by date. */
function CategoryRow({ cat, open, onToggle }: { cat: CategoryFinancials; open: boolean; onToggle: () => void }) {
  const urgentCount = cat.grants.filter((g) => g.urgent || (g.pastDeadline && g.remaining > 0)).length
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer border-t border-line-2 hover:bg-canvas">
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${open ? 'Hide' : 'Show'} grants funding ${cat.name}`}
              onClick={(e) => { e.stopPropagation(); onToggle() }}
              className="rounded p-0.5 text-slate-3 hover:bg-canvas-2"
            >
              <ChevronRight size={16} className={clsx('transition-transform', open && 'rotate-90')} />
            </button>
            <span className="font-medium text-slate">{cat.name}</span>
            <Pill tone="neutral">{cat.grants.length} grant{cat.grants.length === 1 ? '' : 's'}</Pill>
          </div>
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-slate-2">{money(cat.budget)}</td>
        <td className="px-4 py-3 text-right tabular-nums">{money(cat.spent)}</td>
        <td className="px-4 py-3 text-right tabular-nums">
          <div className="font-medium text-slate">{money(cat.remaining)}</div>
          {cat.pastDue > 0 && <div className="text-xs text-bad">+{money(cat.pastDue)} past deadline</div>}
          {cat.overspent > 0 && <div className="text-xs text-bad">{money(cat.overspent)} over</div>}
        </td>
        <td className="w-[18%] px-4 py-3">
          <Meter value={cat.spent} max={cat.budget} height={6} />
        </td>
        <td className="w-24 px-4 py-3 text-right">{urgentCount > 0 && <StatusPill tone="warn">{urgentCount} urgent</StatusPill>}</td>
      </tr>
      {open && (
        <tr className="bg-canvas/60">
          <td colSpan={6} className="px-5 pb-3 pt-1">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-3">
                <tr>
                  <th className="py-1.5 pl-9 font-medium">Grant</th>
                  <th className="py-1.5 text-right font-medium">Budget</th>
                  <th className="py-1.5 text-right font-medium">Spent</th>
                  <th className="py-1.5 text-right font-medium">Remaining</th>
                  <th className="py-1.5 pl-4 font-medium">Spend by · forecast</th>
                  <th className="w-32 py-1.5 text-right font-medium"><span className="sr-only">Urgency</span></th>
                </tr>
              </thead>
              <tbody>
                {cat.grants.map((b) => <GrantBalanceRow key={`${b.grantId}-${b.categoryId}`} b={b} />)}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  )
}

/** Financials: funding combined by category — what's left, where it comes from, and when it must be spent. */
export default function Financials() {
  const { state } = useStore()
  const today = todayISO()
  const overview = useMemo(() => financialsOverview(state.grants, state.transactions, today), [state.grants, state.transactions, today])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (key: string) => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })

  const shown = overview.categories.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
  // The donut plots actual spend against plannable remaining; overspend can't be a pie slice, so it gets its own figure.
  const pie = [
    { name: 'Spent', value: overview.spent, fill: 'var(--color-viz-1)' },
    { name: 'Remaining', value: overview.remaining, fill: 'var(--color-viz-track)' },
    ...(overview.pastDue > 0 ? [{ name: 'Past deadline', value: overview.pastDue, fill: 'var(--color-viz-warn)' }] : []),
  ].filter((d) => d.value > 0)

  return (
    <>
      <PageHeader
        eyebrow="Manage funds"
        title="Financials"
        subtitle="Funding combined by category — how much is left, which grants it comes from, and when it must be spent."
      />

      {!overview.categories.length ? (
        <Card><EmptyState title="No funded budgets yet" icon={<ChevronRight />}>Confirm a grant's budget on its Setup tab, then its categories appear here.</EmptyState></Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-[300px_1fr]">
            <Card title="Actual vs remaining budget" className="row-span-2">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Tooltip content={<SpendTip />} />
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={58} outerRadius={85} strokeWidth={2} stroke="var(--color-surface)">
                    {pie.map((d) => <Cell key={d.name} fill={d.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-1 space-y-1.5 text-sm">
                {pie.map((d) => (
                  <li key={d.name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.fill }} />
                    <span className="text-slate-2">{d.name}</span>
                    <span className="ml-auto tabular-nums text-slate">{moneyExact(d.value)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Funded budget" value={money(overview.budget)} sub="Across all funded grants" />
              <Stat label="Actual spending" value={money(overview.spent)} sub="Reportable charges to approved categories" />
              <Stat label="Remaining to plan" value={money(overview.remaining)} sub="Balances whose spend-by date hasn't passed" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Stat label="Past spending deadline" value={money(overview.pastDue)} sub="Left over after the period ended; not available for planning" />
              <Stat label="Overspent" value={money(overview.overspent)} sub="Categories charged beyond their approved budget" />
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search categories" placeholder="Search categories" className="h-9 w-60 rounded-[3px] border border-control-line bg-surface pl-9 pr-3 text-sm focus:border-link focus:outline-none" />
            </div>
          </div>

          <Card padded={false} className="overflow-hidden">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-slate-2">
                <tr>
                  <th className="px-5 py-3">Category</th>
                  <th className="w-28 px-4 py-3 text-right">Funded</th>
                  <th className="w-28 px-4 py-3 text-right">Spent</th>
                  <th className="w-36 px-4 py-3 text-right">Remaining</th>
                  <th className="px-4 py-3"><span className="sr-only">Used</span></th>
                  <th className="w-24 px-4 py-3 text-right"><span className="sr-only">Urgency</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <Fragment key={c.key}>
                    <CategoryRow cat={c} open={open.has(c.key)} onToggle={() => toggle(c.key)} />
                  </Fragment>
                ))}
              </tbody>
            </table>
            {!shown.length && <p className="py-10 text-center text-sm text-slate-3">No categories match this search.</p>}
          </Card>

          <p className="mt-3 text-xs text-slate-3">
            Spend-by is the end of each grant's funding period. Balances within {URGENT_WINDOW_DAYS} days of it are flagged urgent.
            Forecasts assume spending continues at its current average pace and need at least a month of history; grants with too little
            history are flagged by deadline alone. Both defaults are provisional.
          </p>
        </>
      )}
    </>
  )
}
