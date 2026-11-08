import clsx from 'clsx'
import { Settings2, Table2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MonthlySpendChart } from '@/components/MonthlySpendChart'
import { Button, EmptyState, StatusPill } from '@/components/ui'
import { GrantReport } from '@/features/reports/GrantReport'
import { allocationCategoryName, computeFinancials, FLAG_LABEL, quarterlySpend, sumDollars } from '@grantit/shared/finance'
import { fmtDate, money, moneyExact } from '@grantit/shared/format'
import { needsSetup } from '@grantit/shared/setup'
import { useStore } from '@/store'
import type { Grant } from '@grantit/shared/types'

const RECENT = 5

export function BudgetTab({ grant }: { grant: Grant }) {
  const { state, flags } = useStore()
  const [showMonthly, setShowMonthly] = useState(false)

  const setupBanner = needsSetup(grant) && (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-sm">
      <Settings2 size={16} className="shrink-0 text-warn" />
      <span className="min-w-0 flex-1 text-slate">
        <span className="font-medium">Needs setup.</span> Confirm this award's period and budget before transactions can be charged to it.
      </span>
      <Link to="?tab=setup"><Button size="sm">Go to Setup</Button></Link>
    </div>
  )

  if (!grant.categories.length)
    return (
      <div className="space-y-6">
        {setupBanner}
        <EmptyState icon={<Table2 />} title="No budget configured" action={!setupBanner && <Link to="?tab=setup"><Button size="sm">Configure budget</Button></Link>}>
          Define this grant's approved spending categories to start tracking actuals. You can fill them in from the award letter.
        </EmptyState>
      </div>
    )

  const quarterly = quarterlySpend(grant, state.transactions)
  const recent = state.transactions
    .flatMap((t) => t.allocations.filter((a) => a.grantId === grant.id).map((a, i) => ({ t, a, i })))
    .sort((x, y) => y.t.date.localeCompare(x.t.date))
  const shownRecent = recent.slice(0, RECENT)
  // "Q1 FY2026" → "Q1 ’26" so four quarters fit beside the categories.
  const qLabel = (s = '') => s.replace(/ FY(\d{2})(\d{2})$/, ' ’$2')

  return (
    <div className="space-y-8">
      {setupBanner}

      {/* The same report component as the Reports page. */}
      <GrantReport grant={grant} />

      <section>
        <h4 className="mb-1 text-sm font-semibold text-slate">Spending by funder fiscal quarter</h4>
        <p className="mb-2 text-xs text-slate-3">Reportable spending inside the grant period, by the funder's fiscal calendar. Hover a quarter for its dates.</p>
        <div className="overflow-hidden rounded-lg border border-line-2">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-canvas text-left text-xs font-semibold tracking-wide text-slate-2">
              <tr>
                <th className="w-[28%] px-3 py-2.5 uppercase">Category</th>
                {quarterly.quarters.map((q) => <th key={q.start} className="px-2 py-2.5 text-right" title={q.label}>{qLabel(q.short)}</th>)}
                <th className="px-3 py-2.5 text-right uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-2">
              {quarterly.rows.map((r) => (
                <tr key={r.name}>
                  <td className="truncate px-3 py-2.5 font-medium text-slate" title={r.name}>{r.name}</td>
                  {r.spent.map((v, i) => <td key={i} className={clsx('px-2 py-2.5 text-right tabular-nums', !v && 'text-slate-3')}>{v ? money(v) : '–'}</td>)}
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line bg-canvas font-semibold">
              <tr>
                <td className="px-3 py-2.5">Total</td>
                {quarterly.totals.map((v, i) => <td key={i} className="px-2 py-2.5 text-right tabular-nums">{money(v)}</td>)}
                <td className="px-3 py-2.5 text-right tabular-nums">{money(sumDollars(quarterly.totals))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" onClick={() => setShowMonthly((s) => !s)} aria-expanded={showMonthly} className="mt-2 text-xs text-link hover:underline">
          {showMonthly ? 'Hide monthly' : 'Show monthly'}
        </button>
        {showMonthly && <div className="mt-2"><MonthlySpendChart data={computeFinancials(grant, state.transactions).byMonth} /></div>}
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold text-slate">Recent transactions</h4>
        {shownRecent.length ? (
          <ul className="divide-y divide-line-2 rounded-lg border border-line-2">
            {shownRecent.map(({ t, a, i }) => {
              const fl = (flags.get(t.id) ?? []).filter((x) => !x.grantId || x.grantId === grant.id)
              return (
                <li key={`${t.id}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="w-20 shrink-0 text-xs text-slate-3">{fmtDate(t.date, { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate">{t.description}</span>
                    <span className="block truncate text-xs text-slate-3">{t.vendor} · {allocationCategoryName(grant, a)}</span>
                  </span>
                  {fl.map((x) => <StatusPill key={x.kind} tone="bad">{FLAG_LABEL[x.kind]}{x.overBy ? ` · ${moneyExact(x.overBy)}` : ''}</StatusPill>)}
                  <span className="w-24 text-right tabular-nums">{moneyExact(a.amount)}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-3">No transactions charged yet.</p>
        )}
        <Link to={`/funds/spending?view=all&grant=${grant.id}`} className="mt-2 inline-block text-sm text-link hover:underline">
          See all {recent.length} in Spending →
        </Link>
      </section>
    </div>
  )
}
