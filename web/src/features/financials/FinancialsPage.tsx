import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SpentRemainingPie } from '@/components/SpentRemainingPie'
import { Card, PageHeader } from '@/components/ui'
import { UrgencyPill, UrgentGrants, useUrgency } from '@/features/funds/UrgencyPill'
import { financialsOverview, type CategoryGrantRow } from '@grantit/shared/financials'
import { fmtDate, money, moneyExact, todayISO } from '@grantit/shared/format'
import type { GrantUrgency } from '@grantit/shared/urgency'
import { useStore } from '@/store'

const LEFT_OUT_REASON = { 'needs-setup': 'no confirmed budget yet', closed: 'closed, final report submitted' }

function Deadline({ row, urgency }: { row: CategoryGrantRow; urgency?: GrantUrgency }) {
  const report = row.grant.deadlines.filter((d) => d.kind === 'report' && !d.done).sort((a, b) => a.date.localeCompare(b.date))[0]
  const ended = urgency ? urgency.daysLeft < 0 : false
  return (
    <>
      <div className="text-slate">{ended ? 'Ended ' : 'Ends '}{fmtDate(row.grant.periodEnd)}</div>
      <div className="text-xs text-slate-3">
        {urgency && !ended && `${urgency.daysLeft} day${urgency.daysLeft === 1 ? '' : 's'} left`}
        {urgency && !ended && report && ' · '}
        {report && `report due ${fmtDate(report.date, { month: 'short', day: 'numeric' })}`}
      </div>
    </>
  )
}

/** Grant money by spending category. Read-only: receipts and splits are entered in Spending. */
export default function Financials() {
  const { state } = useStore()
  const urgency = useUrgency()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const today = todayISO()
  const { categories, totals, leftOut, reconciliation: r } = useMemo(
    () => financialsOverview(state.grants, state.transactions, state.orgCategories, today),
    [state.grants, state.transactions, state.orgCategories, today],
  )
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const urgentCount = (rows: CategoryGrantRow[]) => rows.filter((x) => urgency.get(x.grant.id)?.level === 'urgent').length

  return (
    <>
      <PageHeader eyebrow="Manage funds" title="Financials" subtitle="Grant money by spending category, across every grant that can still be charged. Receipts and splits are entered in Spending." />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title={`${money(totals.available)} available across grants`}>
          <SpentRemainingPie spent={totals.spent} remaining={totals.remaining} />
        </Card>
        <UrgentGrants className="self-start" />
      </div>

      <Card padded={false} className="overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-slate-2">
            <tr>
              <th className="px-5 py-3">Category</th>
              <th className="w-32 px-4 py-3 text-right">Available</th>
              <th className="w-32 px-4 py-3 text-right">Spent</th>
              <th className="w-32 px-4 py-3 text-right">Remaining</th>
              <th className="w-28 px-4 py-3">Urgent</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => {
              const expanded = open.has(c.id)
              const urgent = urgentCount(c.grants)
              return (
                <Fragment key={c.id}>
                  <tr onClick={() => toggle(c.id)} className="cursor-pointer border-t border-line-2 hover:bg-canvas">
                    <td className="px-5 py-3">
                      <button type="button" aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} grants for ${c.name}`} onClick={(e) => { e.stopPropagation(); toggle(c.id) }} className="mr-2 rounded p-0.5 align-middle text-slate-3 hover:bg-canvas-2">
                        <ChevronRight size={16} className={clsx('transition-transform', expanded && 'rotate-90')} />
                      </button>
                      <span className="font-medium text-slate">{c.name}</span>
                      <span className="ml-2 text-xs text-slate-3">{c.grants.length} grant{c.grants.length === 1 ? '' : 's'}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-2">{money(c.available)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(c.spent)}</td>
                    <td className={clsx('px-4 py-3 text-right tabular-nums', c.remaining < 0 && 'font-medium text-bad')}>{money(c.remaining)}</td>
                    <td className="px-4 py-3 text-xs">{urgent > 0 ? <span className="font-medium text-bad">{urgent} urgent</span> : <span className="text-slate-3">None</span>}</td>
                  </tr>
                  {expanded && (
                    <tr className="bg-canvas/60">
                      <td colSpan={5} className="px-5 pb-3 pl-12 pt-1">
                        <table className="w-full table-fixed text-sm" aria-label={`Grants contributing to ${c.name}`}>
                          <thead className="text-left text-xs text-slate-3">
                            <tr>
                              <th className="py-1.5 font-medium">Grant</th>
                              <th className="w-24 py-1.5 text-right font-medium">Available</th>
                              <th className="w-24 py-1.5 text-right font-medium">Spent</th>
                              <th className="w-24 py-1.5 text-right font-medium">Remaining</th>
                              <th className="w-44 py-1.5 pl-4 font-medium">Deadline</th>
                              <th className="w-36 py-1.5 font-medium">Urgency</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.grants.map((row) => (
                              <tr key={row.grant.id} className="align-top">
                                <td className="py-1.5 pr-2">
                                  <Link to={`/funds/spending?view=all&grant=${row.grant.id}`} className="font-medium text-link hover:underline">{row.grant.name}</Link>
                                  <div className="truncate text-xs text-slate-3" title={row.lines.join(', ')}>{row.lines.join(', ')}</div>
                                </td>
                                <td className="py-1.5 text-right tabular-nums text-slate-2">{money(row.available)}</td>
                                <td className="py-1.5 text-right tabular-nums">{money(row.spent)}</td>
                                <td className={clsx('py-1.5 text-right tabular-nums', row.remaining < 0 && 'font-medium text-bad')}>{money(row.remaining)}</td>
                                <td className="py-1.5 pl-4"><Deadline row={row} urgency={urgency.get(row.grant.id)} /></td>
                                <td className="py-1.5"><UrgencyPill urgency={urgency.get(row.grant.id)} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot className="border-t border-line bg-canvas font-semibold">
            <tr>
              <td className="px-5 py-3">Total</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(totals.available)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(totals.spent)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(totals.remaining)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>

      <section className="mt-4 space-y-1 text-xs text-slate-2" aria-label="How these numbers reconcile">
        <p>
          <span className="font-medium text-slate">Every receipt in Spending, {moneyExact(r.ledger)}:</span>{' '}
          {moneyExact(r.onTheseGrants)} on these grants · {moneyExact(r.onClosedGrants)} on closed grants · {moneyExact(r.generalFunds)} General funds · {moneyExact(r.notAssigned)} not yet assigned
          {r.notReportable !== 0 && ` · ${moneyExact(r.notReportable)} can't be reported`}
          {!r.balanced && <span className="font-medium text-bad"> These don't add up. Check Spending before relying on this page.</span>}
        </p>
        <p>Spent includes unconfirmed suggestions, as Reports do.</p>
        {leftOut.length > 0 && <p>Not counted: {leftOut.map((l) => `${l.grant.name} (${LEFT_OUT_REASON[l.reason]})`).join('; ')}.</p>}
      </section>
    </>
  )
}
