import clsx from 'clsx'
import { AlertOctagon, Download, Table2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MonthlySpendChart } from '@/components/MonthlySpendChart'
import { Button, EmptyState, Meter, Segmented, Stat, StatusPill } from '@/components/ui'
import { computeFinancials, FLAG_LABEL, inPeriod, periodOptions } from '@/lib/finance'
import { fmtDate, money, moneyExact, pct } from '@/lib/format'
import { downloadFile, expenditureReportCsv } from '@/lib/report'
import { useStore } from '@/store'
import type { Grant } from '@/types'

export function BudgetTab({ grant }: { grant: Grant }) {
  const { state, flags } = useStore()
  const options = periodOptions(grant, state.org.fiscalYearStartMonth)
  const [idx, setIdx] = useState(0)
  const [showTable, setShowTable] = useState(false)
  const period = options[idx] ?? options[0]
  const f = computeFinancials(grant, state.transactions, period)

  if (!grant.categories.length)
    return (
      <EmptyState icon={<Table2 />} title="No budget configured" action={<Link to="?tab=setup"><Button size="sm">Configure budget</Button></Link>}>
        Define this grant's approved spending categories to start tracking actuals.
      </EmptyState>
    )

  const lines = state.transactions
    .flatMap((t) => t.allocations.filter((a) => a.grantId === grant.id).map((a) => ({ t, a })))
    .filter(({ t }) => inPeriod(t.date, period) || flags.get(t.id)?.some((x) => x.kind === 'outside-period' && x.grantId === grant.id))
    .sort((x, y) => y.t.date.localeCompare(x.t.date))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-3">Reporting period</span>
        <Segmented<string>
          value={String(idx)}
          onChange={(v) => setIdx(Number(v))}
          options={options.map((o, i) => ({ id: String(i), label: i === 0 ? 'Funder period' : o.label.replace('Org fiscal year ', '') }))}
        />
        <span className="text-sm text-slate-2">{fmtDate(period.start)} – {fmtDate(period.end)}</span>
        <Button
          variant="secondary"
          size="sm"
          className="ml-auto"
          icon={<Download size={14} />}
          onClick={() => downloadFile(`${grant.name.replace(/\W+/g, '-')}-expenditures.csv`, expenditureReportCsv(grant, state.transactions, period))}
        >
          Export report
        </Button>
      </div>

      {idx > 0 && (
        <p className="-mt-3 text-xs text-slate-3">Showing spending in your organization's fiscal year against the full grant budget. Funder reports use the funder period.</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Approved budget" value={money(f.budget)} />
        <Stat label="Actual spending" value={money(f.spent)} sub={pct(f.ratio)} />
        <Stat label="Remaining" value={<span className={f.remaining < 0 ? 'text-bad' : ''}>{money(f.remaining)}</span>} />
        <Stat label="Unauthorized spend" value={<span className={f.unauthorized.length ? 'text-bad' : ''}>{money(f.unauthorized.reduce((s, u) => s + u.spent, 0))}</span>} sub={f.unauthorized.length ? `${f.unauthorized.length} category` : 'None'} />
      </div>

      <div className="overflow-hidden rounded-lg border border-line-2">
        <table className="w-full text-sm">
          <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-slate-2">
            <tr>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5 text-right">Budget</th>
              <th className="px-4 py-2.5 text-right">Actual</th>
              <th className="px-4 py-2.5 text-right">Remaining</th>
              <th className="hidden w-48 px-4 py-2.5 md:table-cell">Used</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-2">
            {f.categories.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium text-slate">{c.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(c.budget)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(c.spent)}</td>
                <td className={clsx('px-4 py-3 text-right tabular-nums', c.remaining < 0 && 'font-medium text-bad')}>{money(c.remaining)}</td>
                <td className="hidden px-4 py-3 md:table-cell">
                  <div className="flex items-center gap-2">
                    <Meter value={c.spent} max={c.budget} height={6} />
                    <span className="w-10 text-right text-xs tabular-nums text-slate-2">{pct(c.ratio)}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {c.status === 'over' ? <StatusPill tone="bad">Over</StatusPill> : c.status === 'approaching' ? <StatusPill tone="warn">Approaching</StatusPill> : <StatusPill tone="good">OK</StatusPill>}
                </td>
              </tr>
            ))}
            {f.unauthorized.map((u) => (
              <tr key={u.category} className="bg-bad-soft/50">
                <td className="px-4 py-3 font-medium text-bad">
                  <span className="flex items-center gap-1.5"><AlertOctagon size={14} /> {u.category}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-3">—</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(u.spent)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-bad">{money(-u.spent)}</td>
                <td className="hidden px-4 py-3 md:table-cell" />
                <td className="px-4 py-3"><StatusPill tone="bad">Not authorized</StatusPill></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line bg-canvas font-semibold">
            <tr>
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(f.budget)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(f.spent)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(f.remaining)}</td>
              <td className="hidden md:table-cell" />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate">Monthly spending</h4>
          <button onClick={() => setShowTable((s) => !s)} className="text-xs text-link hover:underline">{showTable ? 'Show chart' : 'Show as table'}</button>
        </div>
        {showTable ? (
          <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            {f.byMonth.map((m) => (
              <div key={m.month} className="flex justify-between border-b border-line-2 py-1"><span className="text-slate-2">{m.month}</span><span className="tabular-nums">{money(m.spent)}</span></div>
            ))}
          </div>
        ) : (
          <MonthlySpendChart data={f.byMonth} />
        )}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-slate">Charged transactions <span className="font-normal text-slate-3">({lines.length})</span></h4>
        <div className="overflow-hidden rounded-lg border border-line-2">
          <ul className="max-h-80 divide-y divide-line-2 overflow-y-auto scrollbar-thin">
            {lines.map(({ t, a }) => {
              const fl = (flags.get(t.id) ?? []).filter((x) => !x.grantId || x.grantId === grant.id)
              return (
                <li key={t.id + a.category} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-20 shrink-0 text-xs text-slate-3">{fmtDate(t.date, { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate">{t.description}</span>
                    <span className="block truncate text-xs text-slate-3">{t.vendor} · {a.category}</span>
                  </span>
                  {fl.map((x) => <StatusPill key={x.kind} tone="bad">{FLAG_LABEL[x.kind]}</StatusPill>)}
                  <span className="w-24 text-right tabular-nums">{moneyExact(a.amount)}</span>
                </li>
              )
            })}
          </ul>
        </div>
        <Link to={`/transactions?grant=${grant.id}`} className="mt-2 inline-block text-sm text-link hover:underline">Review in Transactions →</Link>
      </div>
    </div>
  )
}
