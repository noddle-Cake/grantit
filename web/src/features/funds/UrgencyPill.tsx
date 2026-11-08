import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import clsx from 'clsx'
import { Pill, StatusPill } from '@/components/ui'
import { fmtDate, money, todayISO } from '@grantit/shared/format'
import { isDemoOrg, URGENCY_LABEL, urgencyByGrant, urgencySummary, type GrantUrgency } from '@grantit/shared/urgency'
import { useStore } from '@/store'

/** Each funded grant's urgency, from what Spending holds. Simulated history applies to the demo organization only. */
export function useUrgency() {
  const { state } = useStore()
  const today = todayISO()
  return useMemo(() => urgencyByGrant(state.grants, state.transactions, today, { simulate: isDemoOrg(state.org) }), [state.grants, state.transactions, state.org, today])
}

export function UrgencyPill({ urgency: u }: { urgency: GrantUrgency | undefined }) {
  if (!u) return null
  const label = URGENCY_LABEL[u.level]
  const tone = u.level === 'urgent' ? 'bad' : u.level === 'watch' ? 'warn' : u.level === 'on-track' ? 'good' : undefined
  return (
    <span title={urgencySummary(u)} className="inline-flex items-center gap-1">
      {tone ? <StatusPill tone={tone}>{label}</StatusPill> : <Pill>{label}</Pill>}
      {u.basis === 'simulated' && <span className="text-xs text-slate-3">Simulated</span>}
    </span>
  )
}

/** Every urgent grant, soonest deadline first. All of them: a nearer deadline never hides a later one. */
export function UrgentGrants({ className }: { className?: string }) {
  const { state } = useStore()
  const urgency = useUrgency()
  const urgent = [...urgency.values()].filter((u) => u.level === 'urgent').sort((a, b) => a.deadline.localeCompare(b.deadline))
  if (!urgent.length) return null
  return (
    <section aria-label="Urgent spending" className={clsx('rounded-lg bg-bad-soft px-4 py-2.5 text-sm', className)}>
      <h2 className="font-semibold text-slate">Urgent spending</h2>
      <ul className="mt-1 space-y-0.5 text-slate-2">
        {urgent.map((u) => (
          <li key={u.grantId}>
            <Link to={`/grants/${u.grantId}?tab=budget`} className="font-medium text-link hover:underline">{state.grants.find((g) => g.id === u.grantId)?.name}</Link>
            {' '}· ends {fmtDate(u.deadline, { month: 'short', day: 'numeric' })} · about {money(u.atRisk)} likely unspent{u.basis === 'simulated' && ' (simulated)'}
          </li>
        ))}
      </ul>
    </section>
  )
}
