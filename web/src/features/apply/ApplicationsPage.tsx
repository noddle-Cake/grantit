import clsx from 'clsx'
import { ArrowRight, CalendarClock, FileText, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { stageMeta } from '@/lib/labels'
import { Button, Card, EmptyState, Meter, PageHeader, Pill, Segmented } from '@/components/ui'
import { NewGrantModal } from '@/features/grants/NewGrantModal'
import { checkApplication } from '@grantit/shared/drafting'
import { daysUntil, fmtDate, money, relativeDay } from '@grantit/shared/format'
import { can } from '@grantit/shared/permissions'
import { APPLY_STAGES } from '@grantit/shared/workspaces'
import type { Grant } from '@grantit/shared/types'
import { useStore } from '@/store'

type Filter = 'active' | 'submitted' | 'declined'
const ORDER = { drafting: 0, prospect: 1, submitted: 2, declined: 3 } as Record<string, number>

const nextApplicationDeadline = (g: Grant) =>
  g.deadlines.filter((d) => d.kind === 'application' && !d.done).sort((a, b) => a.date.localeCompare(b.date))[0]

export default function Applications() {
  const { state, me } = useStore()
  const [filter, setFilter] = useState<Filter>('active')
  const [query, setQuery] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const pipeline = state.grants.filter((g) => (APPLY_STAGES as readonly string[]).includes(g.stage))
  const matchesFilter = (g: Grant, f: Filter) => f === 'active' ? g.stage === 'drafting' || g.stage === 'prospect' : g.stage === f
  const grants = pipeline
    .filter((g) => matchesFilter(g, filter))
    .filter((g) => `${g.name} ${g.funder}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => ORDER[a.stage] - ORDER[b.stage] || (nextApplicationDeadline(a)?.date ?? '9').localeCompare(nextApplicationDeadline(b)?.date ?? '9'))

  return (
    <>
      <PageHeader
        eyebrow="Find & apply"
        title="Applications"
        subtitle="Track your applications and pick up the next step."
        actions={can(me.role, 'grant:configure') && <Button icon={<Plus size={16} />} onClick={() => setNewOpen(true)}>Add a prospect</Button>}
      />
      {pipeline.length === 0 ? (
        <EmptyState icon={<FileText />} title="No applications yet">
          Find funding in <Link to="/apply" className="text-link hover:underline">Opportunities</Link> or add a prospect to get started.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Segmented<Filter>
              label="Application status"
              value={filter}
              onChange={setFilter}
              options={(['active', 'submitted', 'declined'] as const).map((id) => ({
                id,
                label: `${id === 'active' ? 'In progress' : stageMeta(id).label} ${pipeline.filter((g) => matchesFilter(g, id)).length}`,
              }))}
            />
            <div className="relative w-full sm:ml-auto sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-3" />
              <input aria-label="Search applications" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search applications" className="h-9 w-full rounded-lg border border-control-line bg-surface pl-9 pr-3 text-sm placeholder:text-slate-3" />
            </div>
          </div>
          <Card padded={false}>
            {grants.length ? (
              <ul className="divide-y divide-line-2">
                {grants.map((g) => {
                  const check = checkApplication(g.questions, state.facts)
                  const approved = g.questions.filter((q) => q.status === 'approved').length
                  const due = nextApplicationDeadline(g)
                  const inactive = g.stage === 'submitted' || g.stage === 'declined'
                  const nextStep = inactive ? g.stage === 'submitted' ? 'Awaiting a decision' : 'Application declined'
                    : !g.questions.length ? "Add the funder's questions"
                    : check.overLimit ? `${check.overLimit} over word limit`
                    : check.unsupported ? `${check.unsupported} unsupported claim${check.unsupported === 1 ? '' : 's'}`
                    : check.unanswered ? `${check.unanswered} unanswered`
                    : check.unapproved ? `${check.unapproved} awaiting approval`
                    : 'Ready to submit'
                  return (
                    <li key={g.id} className="grid min-w-0 gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(180px,240px)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Link to={`/grants/${g.id}`} className="font-medium text-link hover:underline">{g.name}</Link>
                          <Pill tone={stageMeta(g.stage).tone} dot>{stageMeta(g.stage).label}</Pill>
                        </div>
                        <p className="text-xs text-slate-2">{g.funder} · {money(g.amount)} requested</p>
                        {!inactive && due && (
                          <p title={fmtDate(due.date)} className={clsx('mt-2 flex items-center gap-1.5 text-xs', daysUntil(due.date) <= 14 ? 'font-medium text-brand-dark' : 'text-slate-2')}>
                            <CalendarClock size={13} /> Due {fmtDate(due.date)} · {relativeDay(due.date)}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className={clsx('text-xs', !inactive && check.ready ? 'font-medium text-good' : 'text-slate-2')}>{nextStep}</p>
                        {!inactive && g.questions.length > 0 && (
                          <div className="mt-2">
                            <Meter value={approved} max={g.questions.length} height={4} />
                            <p className="mt-1 text-xs tabular-nums text-slate-3">{approved} of {g.questions.length} answers approved</p>
                          </div>
                        )}
                      </div>
                      <Link to={`/grants/${g.id}?tab=${g.questions.length || inactive ? 'application' : 'setup'}`} aria-label={`${inactive ? 'View' : 'Continue'} application: ${g.name}`} className="inline-flex items-center gap-1.5 justify-self-start rounded-lg py-1.5 text-sm font-medium text-link hover:underline">
                        {inactive ? 'View application' : 'Continue'} <ArrowRight size={14} />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState icon={<FileText />} title="No applications match">
                {query ? 'Try another grant name or funder.' : `No ${filter === 'active' ? 'applications in progress' : `${filter} applications`}.`}
              </EmptyState>
            )}
          </Card>
        </>
      )}
      <NewGrantModal open={newOpen} onClose={() => setNewOpen(false)} defaultStage="prospect" />
    </>
  )
}
