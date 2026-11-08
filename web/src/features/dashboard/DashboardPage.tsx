import clsx from 'clsx'
import { ArrowRight, BookOpenCheck, CircleDollarSign, Compass, FileWarning, Receipt, Settings2, Sparkles } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { STAGES } from '@/lib/labels'
import { DeadlineTimeline } from '@/components/DeadlineTimeline'
import { collectDeadlines } from '@grantit/shared/deadlines'
import { Card, Meter, PageHeader, Pill } from '@/components/ui'
import { checkApplication } from '@grantit/shared/drafting'
import { computeFinancials, sumDollars } from '@grantit/shared/finance'
import { needsSetup } from '@grantit/shared/setup'
import { NeedsSetupPill } from '@/features/grants/NeedsSetupPill'
import { money, moneyCompact, pct, todayISO } from '@grantit/shared/format'
import { recommendOpportunities } from '@grantit/shared/opportunities'
import { can } from '@grantit/shared/permissions'
import { useStore } from '@/store'

function greeting(now: Date) {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function WorkspaceCard({ icon, title, to, cta, children }: { icon: ReactNode; title: string; to: string; cta: string; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl border border-line-2 bg-surface">
      <div className="flex items-center gap-2 border-b border-line-2 px-5 py-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">{icon}</span>
        <h2 className="font-semibold text-slate">{title}</h2>
      </div>
      <div className="flex-1 px-5 py-4">{children}</div>
      <Link to={to} className="flex items-center justify-between border-t border-line-2 px-5 py-3 text-sm font-medium text-link hover:bg-canvas">
        {cta} <ArrowRight size={14} />
      </Link>
    </section>
  )
}

const Figure = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div>
    <div className="text-xs text-slate-3">{label}</div>
    <div className="text-xl font-semibold tabular-nums text-slate">{value}</div>
    {sub && <div className="text-xs text-slate-3">{sub}</div>}
  </div>
)

/** Home: both workspaces at a glance, plus what needs attention and what's coming up. */
export default function Dashboard() {
  const { state, me, flags, opportunities, dismissedOpportunities } = useStore()
  const [now] = useState(() => new Date())

  // Find & apply
  const pipeline = state.grants.filter((g) => ['prospect', 'drafting', 'submitted'].includes(g.stage))
  const recs = useMemo(
    () => recommendOpportunities(opportunities, state.facts, state.grants, { today: todayISO(), dismissed: dismissedOpportunities }),
    [opportunities, state.facts, state.grants, dismissedOpportunities],
  )
  const best = recs[0]

  // Manage funds
  const active = useMemo(() => state.grants.filter((g) => g.stage === 'awarded' || g.stage === 'reporting'), [state.grants])
  const fin = useMemo(() => active.map((g) => computeFinancials(g, state.transactions)), [active, state.transactions])
  const totalAwarded = active.reduce((s, g) => s + g.amount, 0)
  const totalSpent = sumDollars(fin.map((f) => f.spent))
  const unconfigured = active.filter(needsSetup)
  const atRisk = fin.reduce((n, f) => n + f.categories.filter((c) => c.status !== 'ok').length, 0)

  const flaggedTx = [...flags.values()].filter((f) => f.length)
  const pendingFacts = state.facts.filter((f) => f.status === 'pending')
  const drafting = state.grants.filter((g) => g.stage === 'drafting')

  const todos = [
    can(me.role, 'fact:approve') &&
      pendingFacts.length > 0 && { icon: BookOpenCheck, tone: 'warn' as const, text: `${pendingFacts.length} fact${pendingFacts.length > 1 ? 's' : ''} waiting for approval`, to: '/apply/knowledge?status=pending' },
    ...(can(me.role, 'grant:configure')
      ? unconfigured.map((g) => ({ icon: Settings2, tone: 'warn' as const, text: `${g.name} needs setup: confirm its award period and budget`, to: `/grants/${g.id}?tab=setup` }))
      : []),
    can(me.role, 'finance:review') &&
      flaggedTx.length > 0 && { icon: Receipt, tone: 'bad' as const, text: `${flaggedTx.length} transactions flagged for review`, to: '/funds/spending?view=flagged' },
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
        subtitle="Finding new funding and managing what you've won, side by side."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <WorkspaceCard icon={<Compass size={16} />} title="Find & apply" to="/apply" cta="Go to opportunities">
          <div className="grid grid-cols-2 gap-4">
            <Figure label="In pipeline" value={pipeline.length} sub={`${moneyCompact(pipeline.reduce((s, g) => s + g.amount, 0))} requested`} />
            <Figure label="Recommended" value={recs.length} sub="Open opportunities that fit" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {STAGES.filter((s) => ['prospect', 'drafting', 'submitted'].includes(s.id)).map((s) => (
              <Pill key={s.id} tone={s.tone} dot>
                {s.label} · {state.grants.filter((g) => g.stage === s.id).length}
              </Pill>
            ))}
          </div>
          {best && (
            <Link to="/apply" className="mt-4 flex items-center gap-3 rounded-lg bg-canvas px-3 py-2.5 hover:bg-canvas-2">
              <Sparkles size={16} className="shrink-0 text-brand" />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate font-medium text-slate">{best.opportunity.program}</span>
                <span className="block truncate text-xs text-slate-3">
                  {best.opportunity.funder} · up to {money(best.opportunity.amountMax)} · {Math.round(best.fit * 100)}% fit
                </span>
              </span>
            </Link>
          )}
        </WorkspaceCard>

        <WorkspaceCard icon={<CircleDollarSign size={16} />} title="Manage funds" to="/funds" cta="Go to funded grants">
          <div className="grid grid-cols-2 gap-4">
            <Figure label="Active funding" value={money(totalAwarded)} sub={`${active.length} active grants`} />
            <Figure label="Remaining" value={money(totalAwarded - totalSpent)} sub="Within each grant's own period" />
          </div>
          <div className="mt-4">
            <Meter value={totalSpent} max={totalAwarded} />
            <div className="mt-1.5 text-xs tabular-nums text-slate-2">
              {money(totalSpent)} spent · {pct(totalAwarded ? totalSpent / totalAwarded : 0)} of active budgets
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill tone={flaggedTx.length ? 'bad' : 'good'} dot>{flaggedTx.length} flagged transactions</Pill>
            <Pill tone={atRisk ? 'warn' : 'good'} dot>{atRisk} categories near or over budget</Pill>
          </div>
          {unconfigured.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {unconfigured.map((g) => (
                <Link key={g.id} to={`/grants/${g.id}?tab=setup`} className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-sm hover:bg-canvas-2">
                  <NeedsSetupPill />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate">{g.name}</span>
                  <span className="text-xs text-link">Set up →</span>
                </Link>
              ))}
            </div>
          )}
        </WorkspaceCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
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
    </>
  )
}
