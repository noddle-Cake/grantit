import clsx from 'clsx'
import { ArrowLeft, BookOpenText, CalendarRange, ChevronDown, CircleDollarSign, Scale, Split, User } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApplicationTab } from './grant/ApplicationTab'
import { BudgetTab } from './grant/BudgetTab'
import { OverviewTab } from './grant/OverviewTab'
import { SetupTab } from './grant/SetupTab'
import { factCategoryLabel, stageMeta, STAGES } from '../components/meta'
import { DeadlineTimeline } from '../components/Timeline'
import { EmptyState, Pill, Tabs } from '../components/ui'
import { checkApplication } from '../lib/drafting'
import { fmtDate, money } from '../lib/format'
import { can } from '../lib/permissions'
import { useStore } from '../store/AppStore'
import type { GrantStage } from '../types'

type Tab = 'overview' | 'application' | 'budget' | 'setup'

function Section({ title, children, defaultOpen = true, count }: { title: string; children: ReactNode; defaultOpen?: boolean; count?: number }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-line-2">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-semibold text-slate hover:bg-canvas">
        <ChevronDown size={16} className={clsx('text-slate-3 transition-transform', !open && '-rotate-90')} />
        {title}
        {count !== undefined && <span className="font-normal text-slate-3">({count})</span>}
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  )
}

function Prop({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-1.5 text-xs text-slate-3">{icon}{label}</div>
      <div className="mt-0.5 text-sm text-slate">{children}</div>
    </div>
  )
}

export default function GrantRecord() {
  const { id } = useParams()
  const { state, me, updateGrant, notify } = useStore()
  const [params, setParams] = useSearchParams()
  const grant = state.grants.find((g) => g.id === id)
  const tab = (params.get('tab') as Tab) ?? 'overview'

  if (!grant)
    return <EmptyState icon={<BookOpenText />} title="Grant not found" action={<Link to="/grants" className="text-link">Back to grants</Link>} />

  const owner = state.users.find((u) => u.id === grant.ownerId)
  const check = checkApplication(grant.questions, state.facts)
  const cited = [...new Set(grant.questions.flatMap((q) => q.citations))].map((fid) => state.facts.find((f) => f.id === fid)).filter(Boolean)
  const canConfigure = can(me.role, 'grant:configure')

  return (
    <>
      <Link to="/grants" className="mb-4 inline-flex items-center gap-1 text-sm text-link hover:underline">
        <ArrowLeft size={14} /> Grants
      </Link>

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
        {/* ── Left: record summary (HubSpot "about" column) ── */}
        <aside className="self-start overflow-hidden rounded-lg border border-line-2 bg-white">
          <div className={clsx('h-20', `cover-${grant.cover}`)} />
          <div className="px-5 pb-4 pt-4">
            <h1 className="text-lg font-semibold leading-snug text-slate">{grant.name}</h1>
            <p className="mt-0.5 text-sm text-slate-2">{grant.funder}</p>
            <div className="mt-3 flex items-center gap-2">
              {canConfigure ? (
                <select
                  value={grant.stage}
                  onChange={(e) => {
                    updateGrant(grant.id, { stage: e.target.value as GrantStage })
                    notify(`Stage set to ${stageMeta(e.target.value as GrantStage).label}`)
                  }}
                  className="h-8 rounded-full border border-line bg-white px-3 text-[13px] font-medium text-slate focus:outline-none"
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              ) : (
                <Pill tone={stageMeta(grant.stage).tone} dot>{stageMeta(grant.stage).label}</Pill>
              )}
            </div>
          </div>
          <Section title="About this grant">
            <Prop icon={<CircleDollarSign size={12} />} label="Award amount">{money(grant.amount)}</Prop>
            <Prop icon={<CalendarRange size={12} />} label="Funding / reporting period">
              {fmtDate(grant.periodStart)} – {fmtDate(grant.periodEnd)}
            </Prop>
            <Prop icon={<User size={12} />} label="Grant owner">{owner?.name ?? '—'}</Prop>
            <Prop icon={<Split size={12} />} label="Shared-cost allocation">{grant.allowSplit ? 'Permitted' : 'Not permitted'}</Prop>
          </Section>
          <Section title="Budget categories" count={grant.categories.length} defaultOpen={false}>
            <ul className="space-y-1.5 text-sm">
              {grant.categories.map((c) => (
                <li key={c.id} className="flex justify-between"><span className="text-slate-2">{c.name}</span><span className="tabular-nums">{money(c.budget)}</span></li>
              ))}
            </ul>
          </Section>
        </aside>

        {/* ── Middle: tabs ── */}
        <div className="min-w-0">
          <div className="rounded-t-lg border border-b-0 border-line-2 bg-white px-2">
            <Tabs<Tab>
              value={tab}
              onChange={(t) => setParams({ tab: t })}
              tabs={[
                { id: 'overview', label: 'Overview' },
                {
                  id: 'application',
                  label: 'Application',
                  badge: grant.questions.length ? (
                    <Pill tone={check.ready ? 'good' : 'neutral'}>{grant.questions.filter((q) => q.status === 'approved').length}/{grant.questions.length}</Pill>
                  ) : undefined,
                },
                { id: 'budget', label: 'Budget & spending' },
                { id: 'setup', label: 'Configuration' },
              ]}
            />
          </div>
          <div className="rounded-b-lg border border-line-2 bg-white p-5">
            {tab === 'overview' && <OverviewTab grant={grant} />}
            {tab === 'application' && <ApplicationTab grant={grant} />}
            {tab === 'budget' && <BudgetTab grant={grant} />}
            {tab === 'setup' && <SetupTab grant={grant} />}
          </div>
        </div>

        {/* ── Right: associations ── */}
        <aside className="space-y-4 self-start">
          <div className="rounded-lg border border-line-2 bg-white">
            <div className="px-5 py-3 text-sm font-semibold text-slate">Upcoming deadlines</div>
            <div className="border-t border-line-2 p-5">
              <DeadlineTimeline items={grant.deadlines.map((d) => ({ deadline: d, grant }))} showGrant={false} empty="No deadlines set" />
            </div>
          </div>
          <div className="rounded-lg border border-line-2 bg-white">
            <div className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate"><Scale size={15} /> Funder rules <span className="font-normal text-slate-3">({grant.rules.length})</span></div>
            <ul className="space-y-2 border-t border-line-2 px-5 py-4 text-sm text-slate-2">
              {grant.rules.length ? grant.rules.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-3" />{r}</li>) : <li className="text-slate-3">No rules recorded</li>}
            </ul>
          </div>
          <div className="rounded-lg border border-line-2 bg-white">
            <div className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate"><BookOpenText size={15} /> Knowledge used <span className="font-normal text-slate-3">({cited.length})</span></div>
            <ul className="divide-y divide-line-2 border-t border-line-2">
              {cited.length ? (
                cited.map((f) => (
                  <li key={f!.id}>
                    <Link to={`/knowledge?fact=${f!.id}`} className="block px-5 py-2.5 hover:bg-canvas">
                      <div className="text-sm text-link">{f!.title}</div>
                      <div className="text-xs text-slate-3">{factCategoryLabel(f!.category)}</div>
                    </Link>
                  </li>
                ))
              ) : (
                <li className="px-5 py-4 text-sm text-slate-3">Facts cited in drafted answers appear here.</li>
              )}
            </ul>
          </div>
        </aside>
      </div>
    </>
  )
}
