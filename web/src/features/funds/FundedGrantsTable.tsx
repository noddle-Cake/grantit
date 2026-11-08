import clsx from 'clsx'
import { ChevronRight, Search } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Card, Meter, Pill, Segmented, StatusPill } from '@/components/ui'
import { NeedsSetupPill } from '@/features/grants/NeedsSetupPill'
import { computeFinancials } from '@grantit/shared/finance'
import { money } from '@grantit/shared/format'
import { isOffPace, PACE_LABEL, type FundingState, type Pacing } from '@grantit/shared/funds'
import { can } from '@grantit/shared/permissions'
import { useStore } from '@/store'
import type { Grant } from '@grantit/shared/types'
import { grantLine } from './grantLine'
import { UrgencyPill, useUrgency } from './UrgencyPill'
import { PacingBar } from './PacingBar'
import { useFunds } from './useFunds'

type Filter = 'all' | 'active' | 'closing-out' | 'closed' | 'off-pace'

const matches = (f: Filter, state: FundingState, pace: Pacing) =>
  f === 'all' || (f === 'off-pace' ? isOffPace(pace) : f === 'active' ? state === 'active' || state === 'needs-setup' : state === f)

// What needs doing first: unspent money closing out, then off pace, then setup, then on pace, then closed.
const rank = (p: Pacing) => (p.state === 'closing-out' ? 0 : isOffPace(p) ? 1 : p.state === 'needs-setup' ? 2 : p.state === 'active' ? 3 : 4)

function Status({ grant, pace, issues }: { grant: Grant; pace: Pacing; issues: number }) {
  const { me } = useStore()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pace.state === 'needs-setup' ? (
        can(me.role, 'grant:configure') ? (
          <Link to={`/grants/${grant.id}?tab=setup`} onClick={(e) => e.stopPropagation()}><Button size="sm">Add budget</Button></Link>
        ) : (
          <NeedsSetupPill />
        )
      ) : pace.state === 'closing-out' ? (
        pace.unspent > 0 ? <StatusPill tone="warn">{money(pace.unspent)} unspent</StatusPill> : <StatusPill tone="good">Fully spent</StatusPill>
      ) : pace.state === 'closed' ? (
        <Pill dot>Closed</Pill>
      ) : (
        <StatusPill tone={pace.status === 'on' ? 'good' : 'warn'}>{PACE_LABEL[pace.status!]}</StatusPill>
      )}
      {issues > 0 && (
        <Link to={`/funds/spending?grant=${grant.id}`} onClick={(e) => e.stopPropagation()} className="rounded-full hover:opacity-80">
          <Pill tone="bad">{issues} issue{issues === 1 ? '' : 's'}</Pill>
        </Link>
      )}
    </div>
  )
}

function Categories({ grant, state }: { grant: Grant; state: FundingState }) {
  const { state: app } = useStore()
  const f = computeFinancials(grant, app.transactions)
  if (!grant.categories.length) return <p className="py-2 text-sm text-slate-3">No budget yet. Add it from the award letter on the grant's Setup tab.</p>
  const orgCategoryName = (lineId: string) => {
    const categoryId = grant.categories.find((c) => c.id === lineId)?.acceptedCategoryIds?.[0]
    return app.orgCategories.find((c) => c.id === categoryId)?.name
  }
  return (
    <>
    <table className="w-full table-fixed text-sm">
      <thead className="text-left text-xs text-slate-3">
        <tr>
          <th className="w-[34%] py-1.5 font-medium">Category</th>
          <th className="py-1.5 text-right font-medium">Budget</th>
          <th className="py-1.5 text-right font-medium">Spent</th>
          <th className="py-1.5 text-right font-medium">Remaining</th>
          <th className="w-[26%] py-1.5 pl-4 font-medium"><span className="sr-only">Used</span></th>
        </tr>
      </thead>
      <tbody>
        {f.categories.map((c) => (
          <tr key={c.id}>
            <td className="truncate py-1.5 pr-2 text-slate">
              {c.name}
              {orgCategoryName(c.id) && <span className="ml-1.5 text-xs text-slate-3">{orgCategoryName(c.id)}</span>}
            </td>
            <td className="py-1.5 text-right tabular-nums text-slate-2">{money(c.budget)}</td>
            <td className="py-1.5 text-right font-medium tabular-nums">{money(c.spent)}</td>
            <td className={clsx('py-1.5 text-right tabular-nums', c.remaining < 0 && 'font-medium text-bad')}>{money(c.remaining)}</td>
            <td className="py-1.5 pl-4">
              <div className="flex items-center gap-2">
                {state === 'active' ? (
                  <Meter value={c.spent} max={c.budget} height={6} />
                ) : (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-viz-track"><div className="h-full rounded-full bg-viz-1" style={{ width: `${Math.min(1, c.budget ? c.spent / c.budget : 0) * 100}%` }} /></div>
                )}
                {/* Ended grants don't get "approaching" alerts; their only alert is unspent money. */}
                {state === 'active' && c.status !== 'ok' && <span className={clsx('shrink-0 text-xs font-medium', c.status === 'over' ? 'text-bad' : 'text-warn')}>{c.status === 'over' ? 'Over' : 'Near limit'}</span>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <Link to={`/funds/spending?view=all&grant=${grant.id}`} className="mt-1 inline-block text-xs text-link hover:underline">See these receipts in Spending →</Link>
    </>
  )
}

/** Funded grants as one table: what each has spent, then its categories inline, its pacing, and what it needs. */
export function FundedGrantsTable() {
  const { rows } = useFunds()
  const urgency = useUrgency()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('status') as Filter) ?? 'all'
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const setFilter = (v: Filter) => {
    const p = new URLSearchParams(params)
    if (v === 'all') p.delete('status')
    else p.set('status', v)
    setParams(p)
  }
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const count = (f: Filter) => rows.filter((r) => matches(f, r.pace.state, r.pace)).length
  const shown = rows
    .filter((r) => matches(filter, r.pace.state, r.pace))
    .filter((r) => (r.grant.name + r.grant.funder).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => rank(a.pace) - rank(b.pace))

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search funded grants" placeholder="Search grants or funders" className="h-9 w-60 rounded-[3px] border border-control-line bg-surface pl-9 pr-3 text-sm focus:border-link focus:outline-none" />
        </div>
        <Segmented<Filter>
          label="Filter grants"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: `All ${count('all')}` },
            { id: 'active', label: `Active ${count('active')}` },
            { id: 'closing-out', label: `Closing out ${count('closing-out')}` },
            { id: 'closed', label: `Closed ${count('closed')}` },
            { id: 'off-pace', label: `Off pace ${count('off-pace')}` },
          ]}
        />
      </div>

      <Card padded={false} className="overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-slate-2">
            <tr>
              <th className="w-[36%] px-5 py-3">Grant</th>
              <th className="w-[14%] px-4 py-3 text-right">Spent</th>
              <th className="w-[24%] px-4 py-3">Pacing</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ grant, pace, issues }) => {
              const expanded = open.has(grant.id)
              return (
                <Fragment key={grant.id}>
                  <tr onClick={() => toggle(grant.id)} className="cursor-pointer border-t border-line-2 hover:bg-canvas">
                    <td className="px-5 py-3">
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={`${expanded ? 'Hide' : 'Show'} ${grant.name} budget categories`}
                          onClick={(e) => { e.stopPropagation(); toggle(grant.id) }}
                          className="mt-0.5 rounded p-0.5 text-slate-3 hover:bg-canvas-2"
                        >
                          <ChevronRight size={16} className={clsx('transition-transform', expanded && 'rotate-90')} />
                        </button>
                        <div className="min-w-0">
                          <Link to={`/grants/${grant.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-link hover:underline">{grant.name}</Link>
                          <div className="truncate text-xs text-slate-3">{grant.funder} · {money(grant.amount)}</div>
                          <div className="text-xs text-slate-2">{grantLine(grant, pace)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {pace.state === 'needs-setup' ? <span className="text-slate-3">—</span> : <><div className="font-semibold text-slate">{money(pace.spent)}</div><div className="text-xs text-slate-3">of {money(grant.amount)}</div></>}
                    </td>
                    <td className="px-4 py-3">{pace.state === 'needs-setup' ? <span className="text-xs text-slate-3">Not tracked until the budget is set</span> : <PacingBar pace={pace} />}</td>
                    <td className="px-4 py-3"><div className="flex flex-wrap items-center gap-1.5"><Status grant={grant} pace={pace} issues={issues.count} /><UrgencyPill urgency={urgency.get(grant.id)} /></div></td>
                  </tr>
                  {expanded && (
                    <tr className="bg-canvas/60">
                      <td colSpan={4} className="px-5 pb-3 pl-12 pt-1">
                        <Categories grant={grant} state={pace.state} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {!shown.length && <p className="py-10 text-center text-sm text-slate-3">No grants match this filter.</p>}
      </Card>
    </>
  )
}
