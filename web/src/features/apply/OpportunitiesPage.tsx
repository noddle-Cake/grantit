import clsx from 'clsx'
import { AlertTriangle, ArrowRight, CalendarClock, Check, CircleHelp, ListChecks, Plus, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { NewGrantModal } from '@/features/grants/NewGrantModal'
import { Button, Card, EmptyState, Pill } from '@/components/ui'
import { dateWithRelative, daysUntil, fmtDate, money, todayISO } from '@grantit/shared/format'
import { assumedPeriod, checkRequirements, CLASH_DAYS, deadlineClashes, medianAward, recommendOpportunities, type Recommendation } from '@grantit/shared/opportunities'
import { can } from '@grantit/shared/permissions'
import { useStore } from '@/store'

/** Fit is the share of the funder's focus areas covered by approved facts, so say exactly that. */
function FitBadge({ matched, total }: { matched: number; total: number }) {
  const fit = total ? matched / total : 0
  const tone = fit >= 0.75 ? 'bg-good-soft text-good' : fit >= 0.4 ? 'bg-warn-soft text-warn' : 'bg-canvas-2 text-slate-2'
  return (
    <span title="Focus areas backed by your approved facts" className={clsx('shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', tone)}>
      {matched} of {total} focus areas
    </span>
  )
}

const monthYear = (iso: string) => fmtDate(iso, { month: 'short', year: 'numeric' })

/** What a director needs to decide go or no-go: requirements against facts, clashing deadlines, size, and period. */
function GoNoGo({ rec, median }: { rec: Recommendation; median?: number }) {
  const { state } = useStore()
  const o = rec.opportunity
  const checks = checkRequirements(o, state.facts)
  const clashes = deadlineClashes(o, state.grants)
  const period = assumedPeriod(o)
  const related = checks.filter((c) => c.evidence).length
  return (
    <section aria-label={`Go / no-go: ${o.program}`} className="mt-3 space-y-2 rounded-lg bg-canvas px-3 py-2.5 text-xs text-slate-2">
      {checks.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center gap-x-2 font-medium text-slate">
            <span className="flex items-center gap-1.5"><ListChecks size={12} /> Requirements</span>
            <span className="font-normal text-slate-2">{related} of {checks.length} with a related fact</span>
          </div>
          <ul className="mt-1 space-y-1">
            {checks.map((c) => (
              <li key={c.requirement} className="flex gap-1.5">
                {c.evidence ? <Check size={13} aria-hidden className="mt-px shrink-0 text-good" /> : <CircleHelp size={13} aria-hidden className="mt-px shrink-0 text-slate-3" />}
                <span>
                  {c.requirement}
                  {' — '}
                  {c.evidence ? (
                    <>related fact: <Link to={`/apply/knowledge?fact=${c.evidence.id}`} className="text-link hover:underline">{c.evidence.title}</Link></>
                  ) : (
                    <span className="text-slate-3">no related fact found, check before applying</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {clashes.length > 0 && (
        <p className="flex gap-1.5 font-medium text-brand-dark">
          <AlertTriangle size={13} aria-hidden className="mt-px shrink-0" />
          <span>Within {CLASH_DAYS} days of {clashes.map((c) => `${c.name} (due ${fmtDate(c.due, { month: 'short', day: 'numeric' })})`).join(', ')}</span>
        </p>
      )}
      {median !== undefined && (
        <p>
          Up to {money(o.amountMax)} · your median award is {money(median)}
          {o.amountMax > median * 2 ? ', so this would be one of your largest grants' : ''}
        </p>
      )}
      <p>If awarded: {monthYear(period.start)} – {monthYear(period.end)} <span className="text-slate-3">(assumed until the funder confirms)</span></p>
    </section>
  )
}

function RecommendationCard({ rec, canAdd, median }: { rec: Recommendation; canAdd: boolean; median?: number }) {
  const { state, addOpportunity, dismissOpportunity, notify } = useStore()
  const nav = useNavigate()
  const o = rec.opportunity
  const soon = daysUntil(o.deadline) <= 30
  const clashes = deadlineClashes(o, state.grants)

  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-line-2 bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-3">{o.funder}</div>
          <h2 className="font-semibold text-slate">{o.program}</h2>
        </div>
        <FitBadge matched={rec.matchedAreas.length} total={o.focusAreas.length} />
      </div>
      <p className="mt-2 text-sm text-slate-2">{o.summary}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-2">
        <span className="tabular-nums">{money(o.amountMin)} – {money(o.amountMax)}</span>
        <span className={clsx('flex items-center gap-1', soon && 'font-medium text-brand-dark')}>
          <CalendarClock size={12} /> Due {dateWithRelative(o.deadline)}
        </span>
      </div>

      {clashes.length > 0 && <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-brand-dark">
        <AlertTriangle size={13} aria-hidden className="shrink-0" />
        {clashes.length} application deadline{clashes.length === 1 ? '' : 's'} within {CLASH_DAYS} days
      </p>}

      <details className="mt-3 text-xs text-slate-2">
        <summary className="cursor-pointer font-medium text-link">Why this matches</summary>
        <GoNoGo rec={rec} median={median} />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {o.focusAreas.map((a) => (
            <Pill key={a} tone={rec.matchedAreas.includes(a.toLowerCase()) ? 'good' : 'neutral'}>{a}</Pill>
          ))}
        </div>
        <p className="mt-2 text-slate-3">Source: {o.source}</p>
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

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
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
        {/* Dismissing hides a match for the whole organization, so it's a decision for whoever adds prospects. */}
        {canAdd && (
          <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => dismissOpportunity(o.id)}>
            Dismiss
          </Button>
        )}
      </div>
    </li>
  )
}

export default function Opportunities() {
  const { state, me, opportunities, dismissedOpportunities, restoreOpportunities } = useStore()
  const [newOpen, setNewOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const canAdd = can(me.role, 'grant:configure')
  const median = useMemo(() => medianAward(state.grants), [state.grants])

  const recs = useMemo(
    () => recommendOpportunities(opportunities, state.facts, state.grants, { today: todayISO(), dismissed: dismissedOpportunities }),
    [opportunities, state.facts, state.grants, dismissedOpportunities],
  )
  const visible = showAll ? recs : recs.slice(0, 3)

  return (
    <>
      {canAdd && (
        <div className="mb-4 flex justify-end">
          <Button icon={<Plus size={16} />} onClick={() => setNewOpen(true)}>Add a prospect</Button>
        </div>
      )}

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
            {canAdd && dismissedOpportunities.length > 0 && (
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
                <RecommendationCard key={r.opportunity.id} rec={r} canAdd={canAdd} median={median} />
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
