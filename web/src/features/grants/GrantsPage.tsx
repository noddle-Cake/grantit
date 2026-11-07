import clsx from 'clsx'
import { CalendarClock, Columns3, LayoutGrid, List, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { NewGrantModal } from './NewGrantModal'
import { stageMeta, STAGES } from '@/lib/labels'
import { Avatar, Button, Card, Meter, PageHeader, Pill, Segmented } from '@/components/ui'
import { computeFinancials } from '@grantit/shared/finance'
import { daysUntil, fmtDate, money, relativeDay } from '@grantit/shared/format'
import { can } from '@grantit/shared/permissions'
import { useStore } from '@/store'
import type { Grant } from '@grantit/shared/types'

type View = 'table' | 'board' | 'cards'

function nextDeadline(g: Grant) {
  return g.deadlines.filter((d) => !d.done).sort((a, b) => a.date.localeCompare(b.date))[0]
}

function DeadlineCell({ g }: { g: Grant }) {
  const d = nextDeadline(g)
  if (!d) return <span className="text-slate-3">—</span>
  const days = daysUntil(d.date)
  return (
    <div>
      <div className={clsx('text-sm', days <= 14 ? 'font-medium text-brand-dark' : 'text-slate')}>{relativeDay(d.date)}</div>
      <div className="text-xs text-slate-3">{d.label}</div>
    </div>
  )
}

export default function Grants() {
  const { state, me } = useStore()
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View) ?? 'table'
  const [q, setQ] = useState('')
  const [stage, setStage] = useState<string>('all')
  const [newOpen, setNewOpen] = useState(false)

  const rows = useMemo(
    () =>
      state.grants
        .filter((g) => stage === 'all' || g.stage === stage)
        .filter((g) => (g.name + g.funder).toLowerCase().includes(q.toLowerCase()))
        .map((g) => ({ g, f: computeFinancials(g, state.transactions) })),
    [state.grants, state.transactions, q, stage],
  )
  const owner = (id: string) => state.users.find((u) => u.id === id)

  return (
    <>
      <PageHeader
        title="Grants"
        subtitle={`${state.grants.length} records · each with its own questions, budget, and funding period`}
        actions={can(me.role, 'grant:configure') && <Button icon={<Plus size={16} />} onClick={() => setNewOpen(true)}>Create grant</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search grants or funders" className="h-9 w-64 rounded-[3px] border border-line bg-white pl-9 pr-3 text-sm focus:border-link focus:outline-none" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ id: 'all', label: 'All' }, ...STAGES].map((s) => (
            <button
              key={s.id}
              onClick={() => setStage(s.id)}
              className={clsx('rounded-full border px-3 py-1 text-[13px]', stage === s.id ? 'border-obsidian-2 bg-obsidian-2 text-white' : 'border-line-2 bg-white text-slate-2 hover:border-line')}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Segmented<View>
            value={view}
            onChange={(v) => setParams({ view: v })}
            options={[
              { id: 'table', label: <><List size={14} /> Table</> },
              { id: 'board', label: <><Columns3 size={14} /> Board</> },
              { id: 'cards', label: <><LayoutGrid size={14} /> Cards</> },
            ]}
          />
        </div>
      </div>

      {view === 'table' && (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-slate-2">
                <tr className="border-b border-line-2">
                  <th className="px-5 py-3">Grant</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Funding period</th>
                  <th className="px-4 py-3 w-48">Spent</th>
                  <th className="px-4 py-3">Next deadline</th>
                  <th className="px-4 py-3">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-2">
                {rows.map(({ g, f }) => (
                  <tr key={g.id} className="hover:bg-canvas">
                    <td className="px-5 py-3">
                      <Link to={`/grants/${g.id}`} className="flex items-center gap-3">
                        <span className={clsx('h-8 w-8 shrink-0 rounded-lg', `cover-${g.cover}`)} />
                        <span>
                          <span className="block font-medium text-link hover:underline">{g.name}</span>
                          <span className="block text-xs text-slate-3">{g.funder}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3"><Pill tone={stageMeta(g.stage).tone} dot>{stageMeta(g.stage).label}</Pill></td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(g.amount)}</td>
                    <td className="px-4 py-3 text-slate-2">{fmtDate(g.periodStart, { month: 'short', year: 'numeric' })} – {fmtDate(g.periodEnd, { month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-3">
                      {f.budget > 0 ? (
                        <>
                          <Meter value={f.spent} max={f.budget} height={6} />
                          <div className="mt-1 text-xs tabular-nums text-slate-3">{money(f.spent)} of {money(f.budget)}</div>
                        </>
                      ) : (
                        <span className="text-xs text-slate-3">No budget yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><DeadlineCell g={g} /></td>
                    <td className="px-4 py-3">
                      {owner(g.ownerId) && (
                        <span className="flex items-center gap-2 text-slate-2">
                          <Avatar initials={owner(g.ownerId)!.initials} size={24} /> {owner(g.ownerId)!.name.split(' ')[0]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="py-10 text-center text-sm text-slate-3">No grants match these filters.</p>}
          </div>
        </Card>
      )}

      {view === 'board' && (
        <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-4">
          {STAGES.filter((s) => stage === 'all' || s.id === stage).map((s) => {
            const col = rows.filter((r) => r.g.stage === s.id)
            return (
              <div key={s.id} className="flex w-72 shrink-0 flex-col rounded-lg bg-canvas-2/70">
                <div className="flex items-center justify-between px-3 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-2">{s.label} <span className="ml-1 text-slate-3">{col.length}</span></span>
                </div>
                <div className="flex-1 space-y-2 px-2 pb-2">
                  {col.map(({ g }) => (
                    <Link key={g.id} to={`/grants/${g.id}`} className="block rounded-lg border border-line-2 bg-white p-3 shadow-[0_1px_2px_rgba(33,51,67,.06)] hover:border-line">
                      <div className="flex items-start gap-2.5">
                        <span className={clsx('mt-0.5 h-7 w-7 shrink-0 rounded-lg', `cover-${g.cover}`)} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-link">{g.name}</div>
                          <div className="truncate text-xs text-slate-3">{g.funder}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className="font-medium tabular-nums text-slate">{money(g.amount)}</span>
                        {nextDeadline(g) && (
                          <span className="flex items-center gap-1 text-slate-2"><CalendarClock size={12} /> {relativeDay(nextDeadline(g)!.date)}</span>
                        )}
                      </div>
                    </Link>
                  ))}
                  {!col.length && <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-slate-3">No grants</div>}
                </div>
                <div className="border-t border-line-2 px-3 py-2 text-xs tabular-nums text-slate-2">Total {money(col.reduce((a, r) => a + r.g.amount, 0))}</div>
              </div>
            )
          })}
        </div>
      )}

      {view === 'cards' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ g, f }) => (
            <Link key={g.id} to={`/grants/${g.id}`} className="group overflow-hidden rounded-2xl border border-line-2 bg-white transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className={clsx('relative h-24', `cover-${g.cover}`)}>
                <span className="absolute left-3 top-3"><Pill tone={stageMeta(g.stage).tone} dot className="bg-white/90">{stageMeta(g.stage).label}</Pill></span>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-3">{g.funder}</div>
                <div className="mt-0.5 font-semibold text-slate group-hover:text-link">{g.name}</div>
                <div className="mt-3 flex items-baseline justify-between text-sm">
                  <span className="font-medium tabular-nums">{money(g.amount)}</span>
                  <span className="text-xs text-slate-3">{fmtDate(g.periodStart, { month: 'short', year: 'numeric' })} – {fmtDate(g.periodEnd, { month: 'short', year: 'numeric' })}</span>
                </div>
                {f.spent > 0 && <Meter className="mt-3" value={f.spent} max={f.budget} height={6} />}
                {nextDeadline(g) && <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-2"><CalendarClock size={13} /> {nextDeadline(g)!.label} · {relativeDay(nextDeadline(g)!.date)}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <NewGrantModal open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  )
}
