import clsx from 'clsx'
import { ArrowRight, CalendarClock, Compass, Plus, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GrantList } from '@/features/grants/GrantList'
import { NewGrantModal } from '@/features/grants/NewGrantModal'
import { Button, Card, EmptyState, PageHeader, Pill, Stat } from '@/components/ui'
import { daysUntil, fmtDate, money, moneyCompact, relativeDay, todayISO } from '@grantit/shared/format'
import { recommendOpportunities, type Recommendation } from '@grantit/shared/opportunities'
import { can } from '@grantit/shared/permissions'
import { APPLY_STAGES } from '@grantit/shared/workspaces'
import { useStore } from '@/store'

function FitBadge({ fit }: { fit: number }) {
  const pctFit = Math.round(fit * 100)
  const tone = fit >= 0.75 ? 'bg-good-soft text-good' : fit >= 0.4 ? 'bg-warn-soft text-warn' : 'bg-canvas-2 text-slate-2'
  return <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', tone)}>{pctFit}% fit</span>
}

function RecommendationCard({ rec, canAdd }: { rec: Recommendation; canAdd: boolean }) {
  const { addOpportunity, dismissOpportunity, notify } = useStore()
  const nav = useNavigate()
  const o = rec.opportunity
  const soon = daysUntil(o.deadline) <= 30

  return (
    <li className="flex flex-col rounded-xl border border-line-2 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-3">{o.funder}</div>
          <div className="font-semibold text-slate">{o.program}</div>
        </div>
        <FitBadge fit={rec.fit} />
      </div>
      <p className="mt-2 text-sm text-slate-2">{o.summary}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-2">
        <span className="tabular-nums">{money(o.amountMin)} – {money(o.amountMax)}</span>
        <span className={clsx('flex items-center gap-1', soon && 'font-medium text-brand-dark')}>
          <CalendarClock size={12} /> Due {fmtDate(o.deadline)} · {relativeDay(o.deadline)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {o.focusAreas.map((a) => (
          <Pill key={a} tone={rec.matchedAreas.includes(a.toLowerCase()) ? 'good' : 'neutral'}>{a}</Pill>
        ))}
      </div>

      <div className="mt-3 space-y-1 text-xs text-slate-2">
        <div>
          <span className="font-medium text-slate">Backed by </span>
          {rec.supportingFacts.map((f, i) => (
            <span key={f.id}>
              {i > 0 && ', '}
              <Link to={`/apply/knowledge?fact=${f.id}`} className="text-link hover:underline">{f.title}</Link>
            </span>
          ))}
        </div>
        {rec.wouldStrengthen.length > 0 && (
          <div>
            <span className="font-medium text-warn">Approve to strengthen: </span>
            {rec.wouldStrengthen.map((f, i) => (
              <span key={f.id}>
                {i > 0 && ', '}
                <Link to={`/apply/knowledge?fact=${f.id}`} className="text-link hover:underline">{f.title}</Link>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 pt-4">
        {canAdd && (
          <Button
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => {
              const id = addOpportunity(o)
              notify(`${o.program} added to your pipeline`)
              nav(`/grants/${id}?tab=setup`)
            }}
          >
            Add to pipeline
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => dismissOpportunity(o.id)}>
          Not a fit
        </Button>
      </div>
    </li>
  )
}

export default function Opportunities() {
  const { state, me, opportunities, dismissedOpportunities, restoreOpportunities } = useStore()
  const [newOpen, setNewOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const canAdd = can(me.role, 'grant:configure')

  const recs = useMemo(
    () => recommendOpportunities(opportunities, state.facts, state.grants, { today: todayISO(), dismissed: dismissedOpportunities }),
    [opportunities, state.facts, state.grants, dismissedOpportunities],
  )
  const pipeline = state.grants.filter((g) => (APPLY_STAGES as readonly string[]).includes(g.stage) && g.stage !== 'declined')
  const visible = showAll ? recs : recs.slice(0, 3)

  return (
    <>
      <PageHeader
        eyebrow="Find & apply"
        title="Opportunities"
        subtitle="Funding that fits your work, and the applications you're pursuing."
        actions={canAdd && <Button icon={<Plus size={16} />} onClick={() => setNewOpen(true)}>Add a prospect</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Sparkles size={15} />} label="Recommended" value={recs.length} sub="Open opportunities that fit" />
        <Stat icon={<Compass size={15} />} label="In your pipeline" value={pipeline.length} sub={`${moneyCompact(pipeline.reduce((s, g) => s + g.amount, 0))} requested`} />
        <Stat label="Drafting" value={state.grants.filter((g) => g.stage === 'drafting').length} sub="Applications being written" />
        <Stat label="Submitted" value={state.grants.filter((g) => g.stage === 'submitted').length} sub="Awaiting a decision" />
      </div>

      <Card
        className="mb-6"
        title={
          <span className="flex items-center gap-2">
            <Sparkles size={16} className="text-brand" /> Recommended for you
          </span>
        }
        action={
          <span className="text-xs text-slate-3">
            Matched against your approved facts · demo listings
            {dismissedOpportunities.length > 0 && (
              <>
                {' · '}
                <button onClick={restoreOpportunities} className="text-link hover:underline">
                  Show {dismissedOpportunities.length} dismissed
                </button>
              </>
            )}
          </span>
        }
      >
        {recs.length ? (
          <>
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((r) => (
                <RecommendationCard key={r.opportunity.id} rec={r} canAdd={canAdd} />
              ))}
            </ul>
            {recs.length > 3 && (
              <button onClick={() => setShowAll((s) => !s)} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-link hover:underline">
                {showAll ? 'Show fewer' : `See all ${recs.length} recommendations`} <ArrowRight size={14} />
              </button>
            )}
          </>
        ) : (
          <EmptyState icon={<Sparkles />} title="No new recommendations">
            Approve more facts in the <Link to="/apply/knowledge" className="text-link">knowledge base</Link> to improve matches.
          </EmptyState>
        )}
      </Card>

      <h2 className="mb-3 text-base font-semibold text-slate">Your pipeline</h2>
      <GrantList scope="apply" />

      <NewGrantModal open={newOpen} onClose={() => setNewOpen(false)} defaultStage="prospect" />
    </>
  )
}
