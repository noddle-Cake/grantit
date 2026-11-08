import clsx from 'clsx'
import { ArrowRight, CalendarClock, FileText, Plus, Search, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { stageMeta } from '@/lib/labels'
import { Avatar, Button, Card, EmptyState, Meter, Pill, Segmented } from '@/components/ui'
import { NewGrantModal } from '@/features/grants/NewGrantModal'
import { answerReady, applicationNextStep, byApplicationDeadline, isAtRisk, nextApplicationDeadline, pipelineSummary, regenerable } from '@grantit/shared/applications'
import { dateWithRelative, daysUntil, fmtDate, money, todayISO } from '@grantit/shared/format'
import { can } from '@grantit/shared/permissions'
import { APPLY_STAGES } from '@grantit/shared/workspaces'
import type { Grant } from '@grantit/shared/types'
import { useStore } from '@/store'
import { nextStepHref, whoActs } from './nextStep'
import { BudgetCell, FinanceFactsBar } from './BudgetView'

type Filter = 'active' | 'submitted' | 'declined'
/** What each row details: writing progress, or the money side (Finance's default). */
type View = 'progress' | 'budget'
/** Focus on applications that need attention. */
type Focus = 'at-risk' | 'to-approve' | null
const ORDER = { drafting: 0, prospect: 1, submitted: 2, declined: 3 } as Record<string, number>

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export default function Applications() {
  const { state, me } = useStore()
  const [filter, setFilter] = useState<Filter>('active')
  const [focus, setFocus] = useState<Focus>(null)
  const [query, setQuery] = useState('')
  const [mine, setMine] = useState(false)
  const [view, setView] = useState<View>(() => (me.role === 'finance' ? 'budget' : 'progress'))
  const [viewOptionsOpen, setViewOptionsOpen] = useState(me.role === 'finance')
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
      {can(me.role, 'grant:configure') && (
        <div className="mb-4 flex justify-end">
          <Button icon={<Plus size={16} />} onClick={() => setNewOpen(true)}>Add a prospect</Button>
        </div>
      )}
      {pipeline.length === 0 && !mine ? (
        <EmptyState icon={<FileText />} title="No applications yet">
          Find funding in <Link to="/apply" className="text-link hover:underline">Opportunities</Link> or add a prospect to get started.
        </EmptyState>
      ) : (
        <>
          {(summary.atRisk > 0 || summary.toApprove.answers > 0 || focus) && (
            <div role="group" aria-label="Needs attention" className="mb-4 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-medium text-slate-2">Needs attention</span>
              {([
                { id: 'at-risk', label: 'At risk', count: summary.atRisk },
                { id: 'to-approve', label: 'Answers to approve', count: summary.toApprove.answers },
              ] as const).filter((item) => item.count > 0 || focus === item.id).map((item) => (
                <button key={item.id} type="button" aria-pressed={focus === item.id} onClick={() => toggleFocus(item.id)} className={clsx(
                  'min-h-8 rounded-full border px-3 py-1 text-xs font-medium tabular-nums',
                  focus === item.id ? 'border-link bg-link-soft text-link' : 'border-line-2 bg-surface text-slate-2 hover:border-control-line',
                )}>
                  {item.label} {item.count}
                </button>
              ))}
            </div>
          )}
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
            <details open={viewOptionsOpen} onToggle={(e) => setViewOptionsOpen(e.currentTarget.open)} className="rounded-lg border border-line-2 bg-surface px-3 py-1.5">
              <summary className="cursor-pointer text-xs font-medium text-slate-2">View options</summary>
              <div className="mt-2">
                <Segmented<View>
                  label="Row details"
                  value={view}
                  onChange={setView}
                  options={[{ id: 'progress', label: 'Progress' }, { id: 'budget', label: 'Budget' }]}
                />
              </div>
            </details>
            <div className="relative w-full sm:ml-auto sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-3" />
              <input aria-label="Search applications" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search applications" className="h-9 w-full rounded-lg border border-control-line bg-surface pl-9 pr-3 text-sm placeholder:text-slate-3" />
            </div>
          </div>
          {view === 'budget' && <FinanceFactsBar />}
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
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-2">
                          <span>{g.funder} · {money(g.amount)} requested</span>
                          {owner && (
                            <span className="flex items-center gap-1.5">
                              <Avatar initials={owner.initials} size={16} /> <span><span className="sr-only">Owner: </span>{owner.name}</span>
                            </span>
                          )}
                        </p>
                        {!inactive && due && (
                          <p title={fmtDate(due.date)} className={clsx('mt-2 flex items-center gap-1.5 text-xs', daysUntil(due.date) <= 14 ? 'font-medium text-brand-dark' : 'text-slate-2')}>
                            <CalendarClock size={13} /> Due {dateWithRelative(due.date)}
                          </p>
                        )}
                      </div>
                      {view === 'budget' ? <BudgetCell grant={g} /> : <div>
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
                      </div>}
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
