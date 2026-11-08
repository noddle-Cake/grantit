import clsx from 'clsx'
import { ChevronRight, X } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Modal, Stat } from '@/components/ui'
import { CategoryPie, categoryColor } from '@/features/financials/CategoryPie'
import { UrgencyPill, UrgentGrants, useUrgency } from '@/features/funds/UrgencyPill'
import { financialsOverview, type CategoryGrantRow, type CategoryRow, type Money3 } from '@grantit/shared/financials'
import { fmtDate, money, moneyExact, pct, todayISO } from '@grantit/shared/format'
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

/** Remaining, with anything lapsed or overspent called out beneath it. */
function Remaining({ m }: { m: Money3 }) {
  return (
    <>
      {money(m.remaining)}
      {m.pastDeadline > 0 && <div className="text-xs text-bad">+{money(m.pastDeadline)} past deadline</div>}
      {m.overspent > 0 && <div className="text-xs font-medium text-bad">{money(m.overspent)} over</div>}
    </>
  )
}

/** The grants behind one category, opened from a pie slice or the legend. */
function CategoryBreakdown({ category: c, colorIndex, urgency, onClose }: {
  category: CategoryRow
  colorIndex: number
  urgency: Map<string, GrantUrgency>
  onClose: () => void
}) {
  const color = categoryColor(colorIndex)
  return (
    <Modal open onClose={onClose} label={`${c.name} spending breakdown`} width={760}>
      <div className="flex items-center justify-between border-b border-line-2 px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate">
          <span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: color }} />
          {c.name}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate-2 hover:bg-canvas-2"><X size={18} /></button>
      </div>
      <div className="space-y-5 p-6">
        <div>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-slate-3">Available</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate">{money(c.available)}</dd></div>
            <div><dt className="text-slate-3">Spent</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate">{money(c.spent)}</dd></div>
            <div><dt className="text-slate-3">Remaining</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate"><Remaining m={c} /></dd></div>
          </dl>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-2 flex-1 rounded-full bg-viz-track">
              <div className="h-2 rounded-full" style={{ width: `${Math.min(100, c.available ? (c.spent / c.available) * 100 : 0)}%`, background: color }} />
            </div>
            <span className="text-sm tabular-nums text-slate-2">{pct(c.available ? c.spent / c.available : 0)} spent</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table aria-label={`Grants funding ${c.name}`} className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-2">
              <tr>
                <th className="py-1.5 pr-3">Grant</th>
                <th className="w-24 py-1.5 pr-3 text-right">Available</th>
                <th className="w-28 py-1.5 pr-3 text-right">Spent</th>
                <th className="w-24 py-1.5 pr-3 text-right">Remaining</th>
                <th className="w-40 py-1.5 pr-3">Spend by</th>
                <th className="w-32 py-1.5">Urgency</th>
              </tr>
            </thead>
            <tbody>
              {c.grants.map((row) => (
                <tr key={row.grant.id} className="border-t border-line-2 align-top">
                  <td className="py-2.5 pr-3">
                    <Link to={`/funds/spending?view=all&grant=${row.grant.id}`} className="font-medium text-link hover:underline">{row.grant.name}</Link>
                    <div className="text-xs text-slate-3">{row.grant.funder}</div>
                    <div className="text-xs text-slate-3">{row.lines.join(', ')}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-slate-2">{money(row.available)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {money(row.spent)}
                    <div className="ml-auto mt-1 h-1 w-16 rounded-full bg-viz-track">
                      <div className="h-1 rounded-full" style={{ width: `${Math.min(100, row.available ? (row.spent / row.available) * 100 : 0)}%`, background: color }} />
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums"><Remaining m={row} /></td>
                  <td className="py-2.5 pr-3"><Deadline row={row} urgency={urgency.get(row.grant.id)} /></td>
                  <td className="py-2.5"><UrgencyPill urgency={urgency.get(row.grant.id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}

/** Grant money by spending category. Read-only: receipts and splits are entered in Spending. */
export default function Financials() {
  const { state } = useStore()
  const urgency = useUrgency()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [breakdownId, setBreakdownId] = useState<string | null>(null)
  const today = todayISO()
  const { categories, totals, leftOut, reconciliation: r } = useMemo(
    () => financialsOverview(state.grants, state.transactions, state.orgCategories, today),
    [state.grants, state.transactions, state.orgCategories, today],
  )
  const breakdownIndex = categories.findIndex((c) => c.id === breakdownId)
  const breakdown = breakdownIndex >= 0 ? categories[breakdownIndex] : undefined
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const urgentCount = (rows: CategoryGrantRow[]) => rows.filter((x) => urgency.get(x.grant.id)?.level === 'urgent').length

  return (
    <>
      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card title="Spending by category" padded={false} className="min-w-0">
          <CategoryPie categories={categories} onSelect={setBreakdownId} />
        </Card>
        <div className="space-y-4">
          <Card>
            <p className="text-lg font-semibold text-slate">{money(totals.available)} available across grants</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-slate-3">Spent</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate">{money(totals.spent)}</dd></div>
              <div><dt className="text-slate-3">Remaining</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate">{money(totals.remaining)}</dd></div>
            </dl>
          </Card>
          <Card title="Categories" padded={false}>
            <ul className="p-2">
              {categories.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-label={`Show breakdown for ${c.name}`}
                    onClick={() => setBreakdownId(c.id)}
                    className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-canvas"
                  >
                    <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: categoryColor(i) }} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate">{c.name}</span>
                      <span className="block text-xs tabular-nums text-slate-2">{money(c.spent)} of {money(c.available)} spent · {pct(c.available ? c.spent / c.available : 0)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Stat label="Past spending deadline" value={money(totals.pastDeadline)} sub="Left when a grant's period ended; not counted as available" />
          <Stat label="Overspent" value={money(totals.overspent)} sub="Charged beyond a line's approved budget" />
        </div>
      </div>

      <UrgentGrants className="mb-6" />

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
                    <td className="px-4 py-3 text-right tabular-nums"><Remaining m={c} /></td>
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
                                <td className="py-1.5 text-right tabular-nums"><Remaining m={row} /></td>
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
              <td className="px-4 py-3 text-right tabular-nums"><Remaining m={totals} /></td>
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

      {breakdown && <CategoryBreakdown category={breakdown} colorIndex={breakdownIndex} urgency={urgency} onClose={() => setBreakdownId(null)} />}
    </>
  )
}
