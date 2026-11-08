import clsx from 'clsx'
import { ArrowRight, Landmark } from 'lucide-react'
import { Link } from 'react-router-dom'
import { budgetStatus, moneyRules } from '@grantit/shared/applications'
import { isStale } from '@grantit/shared/fact-impact'
import { fmtDate, money, todayISO } from '@grantit/shared/format'
import type { Grant } from '@grantit/shared/types'
import { useStore } from '@/store'

const monthYear = (iso: string) => fmtDate(iso, { month: 'short', year: 'numeric' })
const SHOWN_RULES = 2

/** Finance's view of an application: when the money would arrive, whether the budget adds up, and the funder's money rules. */
export function BudgetCell({ grant: g }: { grant: Grant }) {
  const budget = budgetStatus(g)
  const rules = moneyRules(g.rules)
  return (
    <div className="space-y-1 text-xs text-slate-2">
      <p>
        <span className="text-slate-3">Period </span>
        {monthYear(g.periodStart)} – {monthYear(g.periodEnd)}
        {g.stage === 'prospect' && <span className="text-slate-3"> (to confirm)</span>}
      </p>
      <p className={clsx(budget.categories && !budget.matchesRequest && 'font-medium text-brand-dark')}>
        {budget.categories
          ? <>Budget {money(budget.total)} in {budget.categories} categor{budget.categories === 1 ? 'y' : 'ies'}{budget.matchesRequest ? ', matches request' : `, request is ${money(g.amount)}`}</>
          : <span className="text-slate-3">No budget drafted yet</span>}
      </p>
      {rules.length > 0 && (
        <ul aria-label="Money rules" className="space-y-0.5">
          {rules.slice(0, SHOWN_RULES).map((r) => <li key={r}>{r}</li>)}
          {rules.length > SHOWN_RULES && <li className="text-slate-3">+{rules.length - SHOWN_RULES} more in setup</li>}
        </ul>
      )}
    </div>
  )
}

/** Whether the finance facts applications draw on are approved and current. */
export function FinanceFactsBar() {
  const { state } = useStore()
  const today = todayISO()
  const finance = state.facts.filter((f) => f.category === 'finance')
  const approved = finance.filter((f) => f.status === 'approved').length
  const waiting = finance.filter((f) => f.status !== 'approved').length
  const stale = finance.filter((f) => isStale(f, today)).length
  const ok = approved > 0 && !waiting && !stale
  const parts = [`${approved} approved`, waiting > 0 && `${waiting} awaiting approval`, stale > 0 && `${stale} over a year old`].filter(Boolean).join(' · ')
  return (
    <div role="status" className={clsx('mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-2.5 text-sm', ok ? 'bg-good-soft' : 'bg-warn-soft')}>
      <Landmark size={15} aria-hidden className={ok ? 'text-good' : 'text-warn'} />
      <span className="font-medium text-slate">Finance facts</span>
      <span className="text-slate-2">{parts}</span>
      <Link to="/apply/knowledge?status=all&category=finance" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-link hover:underline">
        Review finance facts <ArrowRight size={13} />
      </Link>
    </div>
  )
}
