import clsx from 'clsx'
import { AlertTriangle, ArrowRight, BookOpenCheck, CircleDollarSign, FileWarning, Plus, Receipt, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { NewGrantModal } from '@/features/grants/NewGrantModal'
import { stageMeta, STAGES } from '@/lib/labels'
import { DeadlineTimeline } from '@/components/DeadlineTimeline'
import { collectDeadlines } from '@grantit/shared/deadlines'
import { Button, Card, Meter, PageHeader, Pill, Stat, StatusPill } from '@/components/ui'
import { checkApplication } from '@grantit/shared/drafting'
import { computeFinancials } from '@grantit/shared/finance'
import { fmtDate, money, moneyCompact, pct } from '@grantit/shared/format'
import { can } from '@grantit/shared/permissions'
import { useStore } from '@/store'

function greeting(now: Date) {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { state, me, flags } = useStore()
  const [newOpen, setNewOpen] = useState(false)
  const [now] = useState(() => new Date())

  const active = state.grants.filter((g) => g.stage === 'awarded' || g.stage === 'reporting')
  const fin = useMemo(() => active.map((g) => ({ g, f: computeFinancials(g, state.transactions) })), [active, state.transactions])
  const totalAwarded = active.reduce((s, g) => s + g.amount, 0)
  const totalSpent = fin.reduce((s, x) => s + x.f.spent, 0)
  const pipelineValue = state.grants.filter((g) => ['prospect', 'drafting', 'submitted'].includes(g.stage)).reduce((s, g) => s + g.amount, 0)

  const flaggedTx = [...flags.entries()].filter(([, f]) => f.length)
  const pendingFacts = state.facts.filter((f) => f.status === 'pending')
  const drafting = state.grants.filter((g) => g.stage === 'drafting')
  const atRisk = fin.flatMap(({ g, f }) => f.categories.filter((c) => c.status !== 'ok').map((c) => ({ g, c })))

  const todos = [
    can(me.role, 'fact:approve') &&
      pendingFacts.length > 0 && { icon: BookOpenCheck, tone: 'warn' as const, text: `${pendingFacts.length} fact${pendingFacts.length > 1 ? 's' : ''} waiting for approval`, to: '/knowledge?status=pending' },
    can(me.role, 'finance:review') &&
      flaggedTx.length > 0 && { icon: Receipt, tone: 'bad' as const, text: `${flaggedTx.length} transactions flagged for review`, to: '/transactions?view=flagged' },
    ...(can(me.role, 'application:draft')
      ? drafting.map((g) => {
          const c = checkApplication(g.questions, state.facts)
          return { icon: FileWarning, tone: 'warn' as const, text: `${g.name}: ${c.unanswered} of ${g.questions.length} questions unanswered`, to: `/grants/${g.id}?tab=application` }
        })
      : []),
  ].filter(Boolean) as { icon: typeof Receipt; tone: 'warn' | 'bad'; text: string; to: string }[]

  return (
    <>
      <PageHeader
        eyebrow={now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        title={`${greeting(now)}, ${me.name.split(' ')[0]}`}
        subtitle="Here's where your grants stand today."
        actions={can(me.role, 'grant:configure') && <Button icon={<Plus size={16} />} onClick={() => setNewOpen(true)}>New grant</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<CircleDollarSign size={15} />} label="Active funding" value={money(totalAwarded)} sub={`${active.length} active grants`} />
        <Stat icon={<Wallet size={15} />} label="Spent to date" value={money(totalSpent)} sub={`${pct(totalAwarded ? totalSpent / totalAwarded : 0)} of active budgets`} />
        <Stat icon={<CircleDollarSign size={15} />} label="Remaining" value={money(totalAwarded - totalSpent)} sub="Within each grant's own period" />
        <Stat icon={<ArrowRight size={15} />} label="Open pipeline" value={moneyCompact(pipelineValue)} sub={`${state.grants.filter((g) => ['prospect', 'drafting', 'submitted'].includes(g.stage)).length} applications in progress`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card title="Active grants" action={<Link to="/grants" className="text-sm font-medium text-link hover:underline">View all</Link>} padded={false}>
            <ul className="divide-y divide-line-2">
              {fin.map(({ g, f }) => {
                const issues = f.categories.filter((c) => c.status === 'over').length + f.unauthorized.length
                return (
                  <li key={g.id}>
                    <Link to={`/grants/${g.id}`} className="flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-canvas sm:flex-nowrap">
                      <div className={clsx('h-11 w-11 shrink-0 rounded-xl', `cover-${g.cover}`)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-slate">{g.name}</span>
                          <Pill tone={stageMeta(g.stage).tone} dot>{stageMeta(g.stage).label}</Pill>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-3">
                          {g.funder} · {fmtDate(g.periodStart, { month: 'short', year: 'numeric' })} – {fmtDate(g.periodEnd, { month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <div className="w-full sm:w-64">
                        <div className="mb-1.5 flex justify-between text-xs">
                          <span className="tabular-nums text-slate">{money(f.spent)} <span className="text-slate-3">of {money(f.budget)}</span></span>
                          {issues > 0 ? <StatusPill tone="bad">{issues} issue{issues > 1 ? 's' : ''}</StatusPill> : <span className="text-slate-3">{pct(f.ratio)}</span>}
                        </div>
                        <Meter value={f.spent} max={f.budget} />
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>

          <Card title="Application pipeline">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STAGES.filter((s) => ['prospect', 'drafting', 'submitted', 'awarded'].includes(s.id)).map((s) => {
                const gs = state.grants.filter((g) => g.stage === s.id)
                return (
                  <Link key={s.id} to={`/grants?view=board`} className="rounded-lg border border-line-2 p-3 hover:border-line hover:bg-canvas">
                    <Pill tone={s.tone} dot>{s.label}</Pill>
                    <div className="mt-2 text-xl font-semibold tabular-nums text-slate">{gs.length}</div>
                    <div className="text-xs text-slate-3">{money(gs.reduce((a, g) => a + g.amount, 0))}</div>
                  </Link>
                )
              })}
            </div>
          </Card>

          {atRisk.length > 0 && (
            <Card title="Budget watch" action={<span className="text-xs text-slate-3">Categories ≥ 85% spent</span>} padded={false}>
              <ul className="divide-y divide-line-2">
                {atRisk.map(({ g, c }) => (
                  <li key={g.id + c.id} className="flex items-center gap-4 px-5 py-3">
                    <AlertTriangle size={16} className={c.status === 'over' ? 'text-bad' : 'text-warn'} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate">{c.name}</div>
                      <Link to={`/grants/${g.id}?tab=budget`} className="text-xs text-slate-3 hover:text-link">{g.name}</Link>
                    </div>
                    <div className="w-40">
                      <Meter value={c.spent} max={c.budget} height={6} />
                      <div className="mt-1 text-right text-xs tabular-nums text-slate-2">{money(c.spent)} / {money(c.budget)}</div>
                    </div>
                    <StatusPill tone={c.status === 'over' ? 'bad' : 'warn'}>{c.status === 'over' ? 'Over budget' : 'Approaching'}</StatusPill>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Needs your attention" padded={false}>
            {todos.length ? (
              <ul className="divide-y divide-line-2">
                {todos.map((t) => (
                  <li key={t.text}>
                    <Link to={t.to} className="flex items-center gap-3 px-5 py-3.5 hover:bg-canvas">
                      <span className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', t.tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn')}>
                        <t.icon size={16} />
                      </span>
                      <span className="flex-1 text-sm text-slate">{t.text}</span>
                      <ArrowRight size={14} className="text-slate-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-center text-sm text-slate-3">You're all caught up.</p>
            )}
          </Card>
          <Card title="Upcoming">
            <DeadlineTimeline items={collectDeadlines(state.grants).slice(0, 6)} />
          </Card>
        </div>
      </div>

      <NewGrantModal open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  )
}
