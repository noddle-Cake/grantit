import clsx from 'clsx'
import { ArrowLeft, BookOpenText, CalendarRange, ChevronDown, CircleDollarSign, Scale, Split, User } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApplicationTab } from './tabs/ApplicationTab'
import { BudgetTab } from './tabs/BudgetTab'
import { OverviewTab } from './tabs/OverviewTab'
import { SetupTab } from './tabs/SetupTab'
import { factCategoryLabel, stageMeta, STAGES, workspaceFor } from '@/lib/labels'
import { DeadlineTimeline } from '@/components/DeadlineTimeline'
import { EmptyState, Pill, Tabs } from '@/components/ui'
import { checkApplication } from '@grantit/shared/drafting'
import { fmtDate, money } from '@grantit/shared/format'
import { can } from '@grantit/shared/permissions'
import { useStore } from '@/store'
import type { GrantStage } from '@grantit/shared/types'

type Tab = 'overview' | 'application' | 'budget' | 'setup'

function Section({ title, children, defaultOpen = true, count }: { title: string; children: ReactNode; defaultOpen?: boolean; count?: number }) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()
  return (
    <div className="border-t border-line-2">
      <button aria-expanded={open} aria-controls={contentId} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-semibold text-slate hover:bg-canvas">
        <ChevronDown size={16} className={clsx('text-slate-3 transition-transform', !open && '-rotate-90')} />
        {title}
        {count !== undefined && <span className="font-normal text-slate-3">({count})</span>}
      </button>
      <div id={contentId} hidden={!open} className="px-5 pb-4">{children}</div>
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

  if (!grant)
    return <EmptyState icon={<BookOpenText />} title="Grant not found" action={<Link to="/" className="text-link">Back to home</Link>} />

  // Before award the application comes first; after award, the money does.
  const workspace = workspaceFor(grant.stage)
  const funded = workspace.home === '/funds'
  const defaultTab: Tab = funded ? (grant.categories.length ? 'budget' : 'overview') : 'application'
  const availableTabs: Tab[] = funded ? ['overview', 'budget', 'application', 'setup'] : ['application', 'setup']
  const requestedTab = params.get('tab')
  const tab: Tab = availableTabs.includes(requestedTab as Tab) ? requestedTab as Tab : defaultTab

  const owner = state.users.find((u) => u.id === grant.ownerId)
  const check = checkApplication(grant.questions, state.facts)
  const cited = [...new Set(grant.questions.flatMap((q) => q.citations))].map((fid) => state.facts.find((f) => f.id === fid)).filter(Boolean)
  const canConfigure = can(me.role, 'grant:configure')
  const stageControl = canConfigure ? (
    <select
      aria-label="Grant stage"
      value={grant.stage}
      onChange={(e) => {
        updateGrant(grant.id, { stage: e.target.value as GrantStage })
        notify(`Stage set to ${stageMeta(e.target.value as GrantStage).label}`)
      }}
      className="h-8 rounded-full border border-control-line bg-surface px-3 text-[0.8125rem] font-medium text-slate"
    >
      {STAGES.map((s) => (
        <option key={s.id} value={s.id}>{s.label}</option>
      ))}
    </select>
  ) : (
    <Pill tone={stageMeta(grant.stage).tone} dot>{stageMeta(grant.stage).label}</Pill>
  )

  return (
    <>
      <Link to={funded ? workspace.home : "/apply/applications"} className="mb-4 inline-flex items-center gap-1 text-sm text-link hover:underline">
        <ArrowLeft size={14} /> {workspace.label} · {funded ? workspace.listLabel : 'Applications'}
      </Link>

      {funded && (
        <header className="mb-5 rounded-lg border border-line-2 bg-surface">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold leading-snug text-slate">{grant.name}</h1>
              <p className="text-sm text-slate-2">{grant.funder}</p>
            </div>
            {stageControl}
          </div>
          <Section title={`${money(grant.amount)} · ${fmtDate(grant.periodStart)} – ${fmtDate(grant.periodEnd)} · ${owner?.name ?? 'No owner'}`} defaultOpen={false}>
            <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
              <Prop icon={<CircleDollarSign size={12} />} label="Award amount">{money(grant.amount)}</Prop>
              <Prop icon={<CalendarRange size={12} />} label="Funding / reporting period">{fmtDate(grant.periodStart)} – {fmtDate(grant.periodEnd)}</Prop>
              <Prop icon={<User size={12} />} label="Grant owner">{owner?.name ?? '—'}</Prop>
              <Prop icon={<Split size={12} />} label="Shared-cost allocation">{grant.allowSplit ? 'Permitted' : 'Not permitted'}</Prop>
            </div>
          </Section>
        </header>
      )}

      <div className={clsx('grid gap-5', funded ? 'xl:grid-cols-[minmax(0,1fr)_300px]' : 'lg:grid-cols-[260px_minmax(0,1fr)]')}>
        {/* ── Left: application summary (HubSpot "about" column); funded grants use the header above ── */}
        {!funded && <aside className="self-start overflow-hidden rounded-lg border border-line-2 bg-surface">
          <div className={clsx('h-2', `cover-${grant.cover}`)} />
          <div className="px-5 pb-4 pt-4">
            <h1 className="text-lg font-semibold leading-snug text-slate">{grant.name}</h1>
            <p className="mt-0.5 text-sm text-slate-2">{grant.funder}</p>
            <div className="mt-3 flex items-center gap-2">{stageControl}</div>
          </div>
          <Section title="Application details">
            <Prop icon={<CircleDollarSign size={12} />} label="Requested amount">{money(grant.amount)}</Prop>
            <Prop icon={<User size={12} />} label="Grant owner">{owner?.name ?? '—'}</Prop>
          </Section>
          <Section title="Application deadlines">
            <DeadlineTimeline items={grant.deadlines.filter((d) => d.kind === 'application').map((d) => ({ deadline: d, grant }))} showGrant={false} empty="No application deadlines set" />
          </Section>
          {grant.rules.length > 0 && <Section title="Funder rules" defaultOpen={false} count={grant.rules.length}>
            <ul className="space-y-2 text-sm text-slate-2">{grant.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </Section>}
        </aside>}

        {/* ── Middle: tabs ── */}
        <div className="min-w-0">
          <div className="rounded-t-lg border border-b-0 border-line-2 bg-surface px-2">
            <Tabs<Tab>
              id="grant-record"
              label="Grant details"
              value={tab}
              onChange={(t) => setParams({ tab: t })}
              tabs={(() => {
                const application = {
                  id: 'application' as const,
                  label: 'Application',
                  badge: grant.questions.length ? (
                    <Pill tone={check.ready ? 'good' : 'neutral'}>{grant.questions.filter((q) => q.status === 'approved').length}/{grant.questions.length}</Pill>
                  ) : undefined,
                }
                const budget = { id: 'budget' as const, label: 'Budget & spending' }
                if (!funded) return [application, { id: 'setup' as const, label: 'Application setup' }]
                return [
                  { id: 'overview' as const, label: 'Overview' },
                  budget, application,
                  { id: 'setup' as const, label: 'Configuration' },
                ]
              })()}
            />
          </div>
          {availableTabs.map((panel) => (
            <div key={panel} id={`grant-record-${panel}-panel`} role="tabpanel" aria-labelledby={`grant-record-${panel}-tab`} hidden={tab !== panel} tabIndex={0} className="rounded-b-lg border border-line-2 bg-surface p-5">
              {tab === panel && panel === 'overview' && <OverviewTab grant={grant} />}
              {tab === panel && panel === 'application' && <ApplicationTab grant={grant} />}
              {tab === panel && panel === 'budget' && <BudgetTab grant={grant} />}
              {tab === panel && panel === 'setup' && <SetupTab grant={grant} />}
            </div>
          ))}
        </div>

        {/* ── Right: associations ── */}
        {funded && <aside className="space-y-4 self-start">
          <div className="rounded-lg border border-line-2 bg-surface">
            <div className="px-5 py-3 text-sm font-semibold text-slate">Upcoming deadlines</div>
            <div className="border-t border-line-2 p-5">
              <DeadlineTimeline items={grant.deadlines.map((d) => ({ deadline: d, grant }))} showGrant={false} empty="No deadlines set" />
            </div>
          </div>
          <div className="rounded-lg border border-line-2 bg-surface">
            <div className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate"><Scale size={15} /> Funder rules <span className="font-normal text-slate-3">({grant.rules.length})</span></div>
            <ul className="space-y-2 border-t border-line-2 px-5 py-4 text-sm text-slate-2">
              {grant.rules.length ? grant.rules.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-3" />{r}</li>) : <li className="text-slate-3">No rules recorded</li>}
            </ul>
          </div>
          <div className="rounded-lg border border-line-2 bg-surface">
            <div className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate"><BookOpenText size={15} /> Knowledge used <span className="font-normal text-slate-3">({cited.length})</span></div>
            <ul className="divide-y divide-line-2 border-t border-line-2">
              {cited.length ? (
                cited.map((f) => (
                  <li key={f!.id}>
                    <Link to={`/apply/knowledge?fact=${f!.id}`} className="block px-5 py-2.5 hover:bg-canvas">
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
        </aside>}
      </div>
    </>
  )
}
