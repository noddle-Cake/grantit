import clsx from 'clsx'
import { ArrowRight, CalendarClock, FileText, Plus, Search, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { stageMeta } from '@/lib/labels'
import { Avatar, Button, Card, EmptyState, Meter, PageHeader, Pill, Segmented } from '@/components/ui'
import { NewGrantModal } from '@/features/grants/NewGrantModal'
import { answerReady, applicationNextStep, byApplicationDeadline, isAtRisk, nextApplicationDeadline, pipelineSummary, regenerable } from '@grantit/shared/applications'
import { daysUntil, fmtDate, money, relativeDay, todayISO } from '@grantit/shared/format'
import { can } from '@grantit/shared/permissions'
import { APPLY_STAGES } from '@grantit/shared/workspaces'
import type { Grant } from '@grantit/shared/types'
import { useStore } from '@/store'
import { nextStepHref, whoActs } from './nextStep'

type Filter = 'active' | 'submitted' | 'declined'
/** A narrower view of in-progress applications, chosen from the summary tiles. */
type Focus = 'at-risk' | 'to-approve' | null
const ORDER = { drafting: 0, prospect: 1, submitted: 2, declined: 3 } as Record<string, number>

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function Tile({ label, value, sub, pressed, tone, onClick }: { label: string; value: number; sub: string; pressed: boolean; tone?: 'warn'; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={clsx(
        'rounded-lg border p-3.5 text-left transition-colors sm:p-4',
        pressed ? 'border-link bg-link-soft' : 'border-line-2 bg-surface hover:border-control-line',
      )}
    >
      <span className="block text-[0.8125rem] text-slate-2">{label}</span>
      <span className={clsx('mt-1 block text-2xl font-semibold tabular-nums', tone === 'warn' && value > 0 ? 'text-brand-dark' : 'text-slate')}>{value}</span>
      <span className="mt-0.5 block text-xs text-slate-2">{sub}</span>
    </button>
  )
}

export default function Applications() {
  const { state, me } = useStore()
  const [filter, setFilter] = useState<Filter>('active')
  const [focus, setFocus] = useState<Focus>(null)
  const [query, setQuery] = useState('')
  const [mine, setMine] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const today = todayISO()
  const pipeline = state.grants
    .filter((g) => (APPLY_STAGES as readonly string[]).includes(g.stage))
    .filter((g) => !mine || g.ownerId === me.id)
  const summary = pipelineSummary(pipeline, state.facts, today)
  const matchesFilter = (g: Grant, f: Filter) => f === 'active' ? g.stage === 'drafting' || g.stage === 'prospect' : g.stage === f
  const matchesFocus = (g: Grant) =>
    focus === 'at-risk' ? isAtRisk(g, state.facts, today) : focus === 'to-approve' ? applicationNextStep(g, state.facts).check.unapproved > 0 : true
  const show = (f: Filter, fo: Focus = null) => { setFilter(f); setFocus(fo) }
  const toggleFocus = (fo: Exclude<Focus, null>) => show('active', focus === fo ? null : fo)
  const grants = pipeline
    .filter((g) => matchesFilter(g, filter))
    .filter((g) => filter !== 'active' || matchesFocus(g))
    .filter((g) => `${g.name} ${g.funder}`.toLowerCase().includes(query.trim().toLowerCase()))
    // Soonest deadline first, whatever the stage: a prospect due next week outranks a draft due next quarter.
    .sort((a, b) => byApplicationDeadline(a, b) || ORDER[a.stage] - ORDER[b.stage])

  return (
    <>
      <PageHeader
        eyebrow="Find & apply"
        title="Applications"
        subtitle="Track your applications and pick up the next step."
        actions={can(me.role, 'grant:configure') && <Button icon={<Plus size={16} />} onClick={() => setNewOpen(true)}>Add a prospect</Button>}
      />
      {pipeline.length === 0 && !mine ? (
        <EmptyState icon={<FileText />} title="No applications yet">
          Find funding in <Link to="/apply" className="text-link hover:underline">Opportunities</Link> or add a prospect to get started.
        </EmptyState>
      ) : (
        <>
          <div role="group" aria-label="Summary" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="In progress" value={summary.inProgress.count} sub={`${money(summary.inProgress.amount)} requested`} pressed={filter === 'active' && !focus} onClick={() => show('active')} />
            <Tile label="At risk" value={summary.atRisk} sub="Due within 14 days, not ready" tone="warn" pressed={focus === 'at-risk'} onClick={() => toggleFocus('at-risk')} />
            <Tile
              label="Answers to approve"
              value={summary.toApprove.answers}
              sub={summary.toApprove.applications ? `In ${count(summary.toApprove.applications, 'application')}` : 'None waiting'}
              pressed={focus === 'to-approve'}
              onClick={() => toggleFocus('to-approve')}
            />
            <Tile label="Submitted" value={summary.submitted.count} sub={`${money(summary.submitted.amount)} awaiting decisions`} pressed={filter === 'submitted'} onClick={() => show('submitted')} />
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Segmented<Filter>
              label="Application status"
              value={filter}
              onChange={(f) => show(f)}
              options={(['active', 'submitted', 'declined'] as const).map((id) => ({
                id,
                label: `${id === 'active' ? 'In progress' : stageMeta(id).label} ${pipeline.filter((g) => matchesFilter(g, id)).length}`,
              }))}
            />
            <button
              type="button"
              aria-pressed={mine}
              onClick={() => setMine((m) => !m)}
              className={clsx('h-9 rounded-lg border px-3 text-sm font-medium', mine ? 'border-link bg-link-soft text-link' : 'border-control-line bg-surface text-slate-2 hover:text-slate')}
            >
              Mine
            </button>
            <div className="relative w-full sm:ml-auto sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-3" />
              <input aria-label="Search applications" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search applications" className="h-9 w-full rounded-lg border border-control-line bg-surface pl-9 pr-3 text-sm placeholder:text-slate-3" />
            </div>
          </div>
          <Card padded={false}>
            {grants.length ? (
              <ul className="divide-y divide-line-2">
                {grants.map((g) => {
                  const next = applicationNextStep(g, state.facts)
                  const readyCount = g.questions.filter((q) => answerReady(q, state.facts)).length
                  const actor = whoActs(next.actor, g, state.users, me)
                  const due = nextApplicationDeadline(g)
                  const owner = state.users.find((u) => u.id === g.ownerId)
                  const inactive = g.stage === 'submitted' || g.stage === 'declined'
                  const fresh = inactive ? [] : regenerable(g, state.facts)
                  return (
                    <li key={g.id} className="grid min-w-0 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(180px,240px)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Link to={`/grants/${g.id}`} className="font-medium text-link hover:underline">{g.name}</Link>
                          <Pill tone={stageMeta(g.stage).tone} dot>{stageMeta(g.stage).label}</Pill>
                        </div>
                        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-2">
                          <span>{g.funder} · {money(g.amount)} requested</span>
                          {owner && (
                            <span className="flex items-center gap-1.5">
                              · <Avatar initials={owner.initials} size={16} /> <span><span className="sr-only">Owner: </span>{owner.name}</span>
                            </span>
                          )}
                        </p>
                        {!inactive && due && (
                          <p title={fmtDate(due.date)} className={clsx('mt-2 flex items-center gap-1.5 text-xs', daysUntil(due.date) <= 14 ? 'font-medium text-brand-dark' : 'text-slate-2')}>
                            <CalendarClock size={13} /> Due {fmtDate(due.date)} · {relativeDay(due.date)}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className={clsx('text-xs', next.ready ? 'font-medium text-good' : 'text-slate-2')}>{next.text}</p>
                        {actor && (
                          <p className="mt-1 flex items-center gap-1.5 text-xs">
                            {actor.id === me.id ? (
                              <span className="font-medium text-brand-dark">Your turn</span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-slate-2"><Avatar initials={actor.initials} size={16} /> Waiting on {actor.name.split(' ')[0]}</span>
                            )}
                          </p>
                        )}
                        {fresh.length > 0 && (
                          <Link to={`/grants/${g.id}?tab=application#q-${fresh[0].id}`} className="mt-1 flex items-center gap-1.5 text-xs font-medium text-link hover:underline">
                            <Sparkles size={12} /> New facts for {count(fresh.length, 'answer')}
                          </Link>
                        )}
                        {!inactive && g.questions.length > 0 && (
                          <div className="mt-2">
                            <Meter value={readyCount} max={g.questions.length} height={4} />
                            <p className="mt-1 text-xs tabular-nums text-slate-3">{readyCount} of {g.questions.length} answers ready</p>
                          </div>
                        )}
                      </div>
                      <Link to={nextStepHref(g, next)} aria-label={`${inactive ? 'View' : 'Continue'} application: ${g.name}`} className="inline-flex items-center gap-1.5 justify-self-start rounded-lg py-1.5 text-sm font-medium text-link hover:underline">
                        {inactive ? 'View application' : 'Continue'} <ArrowRight size={14} />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState icon={<FileText />} title="No applications match">
                {query ? 'Try another grant name or funder.'
                  : focus === 'at-risk' ? 'Nothing at risk: every application due in the next 14 days is ready.'
                  : focus === 'to-approve' ? 'No answers are waiting for approval.'
                  : mine ? 'None of your applications are in this view. Turn off Mine to see everyone’s.'
                  : `No ${filter === 'active' ? 'applications in progress' : `${filter} applications`}.`}
              </EmptyState>
            )}
          </Card>
        </>
      )}
      <NewGrantModal open={newOpen} onClose={() => setNewOpen(false)} defaultStage="prospect" />
    </>
  )
}
