import { AlertOctagon, CheckCircle2, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ANSWER_STATUS } from '../../components/meta'
import { Meter, Pill, Stat, StatusPill } from '../../components/ui'
import { checkApplication } from '../../lib/drafting'
import { computeFinancials } from '../../lib/finance'
import { money, pct, wordCount } from '../../lib/format'
import { useStore } from '../../store/AppStore'
import type { Grant } from '../../types'

export function OverviewTab({ grant }: { grant: Grant }) {
  const { state } = useStore()
  const f = computeFinancials(grant, state.transactions)
  const check = checkApplication(grant.questions, state.facts)
  const issues = f.categories.filter((c) => c.status === 'over').length + f.unauthorized.length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Award" value={money(grant.amount)} />
        <Stat label="Approved budget" value={money(f.budget)} sub={f.budget !== grant.amount && f.budget ? `${money(grant.amount - f.budget)} unallocated` : undefined} />
        <Stat label="Spent in period" value={money(f.spent)} sub={pct(f.ratio)} />
        <Stat label="Remaining" value={money(f.remaining)} />
      </div>

      {f.budget > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate">Spending by category</h4>
            {issues > 0 ? <StatusPill tone="bad">{issues} compliance issue{issues > 1 ? 's' : ''}</StatusPill> : <StatusPill tone="good">Within budget</StatusPill>}
          </div>
          <div className="space-y-3">
            {f.categories.map((c) => (
              <div key={c.id} className="grid grid-cols-[140px_1fr_150px] items-center gap-3 text-sm">
                <span className="truncate text-slate-2">{c.name}</span>
                <Meter value={c.spent} max={c.budget} />
                <span className="text-right tabular-nums text-slate">{money(c.spent)} <span className="text-slate-3">/ {money(c.budget)}</span></span>
              </div>
            ))}
          </div>
          <Link to="?tab=budget" className="mt-3 inline-block text-sm text-link hover:underline">Open budget detail →</Link>
        </div>
      )}

      {grant.questions.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate">Application</h4>
            {check.ready ? <StatusPill tone="good">Ready to submit</StatusPill> : <StatusPill tone="warn">In progress</StatusPill>}
          </div>
          <ul className="divide-y divide-line-2 rounded-lg border border-line-2">
            {grant.questions.map((q, i) => {
              const over = wordCount(q.answer) > q.wordLimit
              return (
                <li key={q.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText size={15} className="shrink-0 text-slate-3" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate">{i + 1}. {q.prompt}</span>
                  <span className={over ? 'text-xs font-medium text-bad' : 'text-xs text-slate-3'}>
                    {over ? <AlertOctagon size={12} className="mr-1 inline" /> : q.status === 'approved' ? <CheckCircle2 size={12} className="mr-1 inline text-good" /> : null}
                    {wordCount(q.answer)}/{q.wordLimit}
                  </span>
                  <Pill tone={ANSWER_STATUS[q.status].tone}>{ANSWER_STATUS[q.status].label}</Pill>
                </li>
              )
            })}
          </ul>
          <Link to="?tab=application" className="mt-3 inline-block text-sm text-link hover:underline">Open application →</Link>
        </div>
      )}
    </div>
  )
}
