import clsx from 'clsx'
import { ArrowRight, BookOpenCheck, CircleDollarSign, Compass, FileWarning, Receipt, Settings2, Sparkles } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { STAGES } from '@/lib/labels'
import { DeadlineTimeline } from '@/components/DeadlineTimeline'
import { collectDeadlines } from '@grantit/shared/deadlines'
import { Card, PageHeader, Pill } from '@/components/ui'
import { applicationNextStep, isInProgress, regenerable } from '@grantit/shared/applications'
import { isOpenAward, needsSetup } from '@grantit/shared/setup'
import { ActionCards } from '@/features/funds/ActionCards'
import { useFunds } from '@/features/funds/useFunds'
import { NeedsSetupPill } from '@/features/grants/NeedsSetupPill'
import { money, moneyCompact, todayISO } from '@grantit/shared/format'
import { recommendOpportunities } from '@grantit/shared/opportunities'
import { can, canApproveFact } from '@grantit/shared/permissions'
import { useStore } from '@/store'
import { nextStepHref } from '@/features/apply/nextStep'

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
  const { state, me, opportunities, dismissedOpportunities } = useStore()
  const [now] = useState(() => new Date())

  // Find & apply
  const pipeline = state.grants.filter((g) => ['prospect', 'drafting', 'submitted'].includes(g.stage))
  const recs = useMemo(
    () => recommendOpportunities(opportunities, state.facts, state.grants, { today: todayISO(), dismissed: dismissedOpportunities }),
    [opportunities, state.facts, state.grants, dismissedOpportunities],
  )
  const best = recs[0]

  // Manage funds: the same action counts as the Funded grants page (shared/src/funds.ts).
  const { queue } = useFunds()
  const unconfigured = state.grants.filter((g) => isOpenAward(g) && needsSetup(g))
  // Only the facts this person may approve (program staff and finance each approve their own categories).
  const pendingFacts = state.facts.filter((f) => f.status === 'pending' && canApproveFact(me.role, f.category))
  const drafting = state.grants.filter((g) => g.stage === 'drafting')

  const todos = [
    can(me.role, 'fact:approve') &&
      pendingFacts.length > 0 && { icon: BookOpenCheck, tone: 'warn' as const, text: `${pendingFacts.length} fact${pendingFacts.length > 1 ? 's' : ''} waiting for approval`, to: '/apply/knowledge?status=pending' },
    ...(can(me.role, 'grant:configure')
      ? unconfigured.map((g) => ({ icon: Settings2, tone: 'warn' as const, text: `${g.name} needs setup: confirm its award period and budget`, to: `/grants/${g.id}?tab=setup` }))
      : []),
    can(me.role, 'finance:review') &&
      queue.count > 0 && { icon: Receipt, tone: 'warn' as const, text: `${queue.count} expense${queue.count === 1 ? '' : 's'} to review`, to: '/funds/spending' },
    ...(can(me.role, 'application:draft')
      ? drafting.flatMap((g) => {
          // The same next step the Applications list shows, so the two never disagree.
          const next = applicationNextStep(g, state.facts)
          return next.ready ? [] : [{ icon: FileWarning, tone: 'warn' as const, text: `${g.name}: ${next.text}`, to: nextStepHref(g, next) }]
        })
      : []),
    // The writer hears when facts their drafts were missing get approved.
    ...(can(me.role, 'application:draft')
      ? state.grants.filter((g) => isInProgress(g) && g.ownerId === me.id).flatMap((g) => {
          const fresh = regenerable(g, state.facts)
          if (!fresh.length) return []
          const answers = `${fresh.length} answer${fresh.length === 1 ? '' : 's'}`
          return [{ icon: Sparkles, tone: 'good' as const, text: `${g.name}: new facts approved for ${answers}, regenerate to use them`, to: `/grants/${g.id}?tab=application#q-${fresh[0].id}` }]
        })
      : []),
  ].filter(Boolean) as { icon: typeof Receipt; tone: 'warn' | 'bad' | 'good'; text: string; to: string }[]

  return (
    <>
      <PageHeader
        eyebrow={now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        title={`${greeting(now)}, ${me.name.split(' ')[0]}`}
        subtitle="Finding new funding and managing what you've won, side by side."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <WorkspaceCard icon={<Compass size={16} />} title="Find & apply" to="/apply" cta="Go to opportunities">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  {best.opportunity.funder} · up to {money(best.opportunity.amountMax)} · {best.matchedAreas.length} of {best.opportunity.focusAreas.length} focus areas
                </span>
              </span>
            </Link>
          )}
        </WorkspaceCard>

        <WorkspaceCard icon={<CircleDollarSign size={16} />} title="Manage funds" to="/funds" cta="Go to funded grants">
          <ActionCards className="grid grid-cols-1 gap-3 sm:grid-cols-3" />
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
                    <span className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', t.tone === 'bad' ? 'bg-bad-soft text-bad' : t.tone === 'good' ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn')}>
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
