import clsx from 'clsx'
import { ArrowRight, CalendarClock, Plus, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { NewGrantModal } from '@/features/grants/NewGrantModal'
import { Button, Card, EmptyState, PageHeader, Pill } from '@/components/ui'
import { daysUntil, fmtDate, money, relativeDay, todayISO } from '@grantit/shared/format'
import { recommendOpportunities, type Recommendation } from '@grantit/shared/opportunities'
import { can } from '@grantit/shared/permissions'
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
    <li className="flex flex-col rounded-xl border border-line-2 bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-3">{o.funder}</div>
          <h2 className="font-semibold text-slate">{o.program}</h2>
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

      <details className="mt-3 text-xs text-slate-2">
        <summary className="cursor-pointer font-medium text-link">Why this matches</summary>
        <div className="mt-2 space-y-1">
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
      </details>

      <div className="mt-auto flex items-center gap-2 pt-4">
        {canAdd && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus size={14} />}
            onClick={() => {
              const id = addOpportunity(o)
              notify(`${o.program} added to the pipeline`)
              nav(`/grants/${id}?tab=setup`)
            }}
          >
            Add to pipeline
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => dismissOpportunity(o.id)}>
          Dismiss
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
  const visible = showAll ? recs : recs.slice(0, 3)

  return (
    <>
      <PageHeader
        eyebrow="Find & apply"
        title="Opportunities"
        subtitle="Find funding that fits your organization."
        actions={canAdd && <Button icon={<Plus size={16} />} onClick={() => setNewOpen(true)}>Add a prospect</Button>}
      />

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
              <button aria-expanded={showAll} onClick={() => setShowAll((s) => !s)} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-link hover:underline">
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

      <Link to="/apply/applications" className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline">
        View applications <ArrowRight size={14} />
      </Link>

      <NewGrantModal open={newOpen} onClose={() => setNewOpen(false)} defaultStage="prospect" />
    </>
  )
}
