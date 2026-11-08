import { AlertOctagon, CheckCircle2, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ANSWER_STATUS } from '@/lib/labels'
import { Pill, StatusPill } from '@/components/ui'
import { checkApplication } from '@grantit/shared/drafting'
import { money, todayISO, wordCount } from '@grantit/shared/format'
import { grantIssues, PACE_LABEL, pacing } from '@grantit/shared/funds'
import { grantLine } from '@/features/funds/grantLine'
import { PacingBar } from '@/features/funds/PacingBar'
import { useStore } from '@/store'
import type { Grant } from '@grantit/shared/types'

export function OverviewTab({ grant }: { grant: Grant }) {
  const { state } = useStore()
  const today = todayISO()
  const pace = pacing(grant, state.transactions, today)
  const issues = grantIssues(grant, state.transactions, today).count
  const check = checkApplication(grant.questions, state.facts)

  return (
    <div className="space-y-6">
      {/* Spending detail lives on Budget & spending; here, only how this grant is pacing. */}
      {pace.state !== 'needs-setup' && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate">Pacing</h4>
            <div className="flex gap-1.5">
              {pace.state === 'closing-out' ? <StatusPill tone={pace.unspent > 0 ? 'warn' : 'good'}>{pace.unspent > 0 ? `${money(pace.unspent)} unspent` : 'Fully spent'}</StatusPill>
                : pace.state === 'active' ? <StatusPill tone={pace.status === 'on' ? 'good' : 'warn'}>{PACE_LABEL[pace.status!]}</StatusPill>
                : <Pill dot>Closed</Pill>}
              {issues > 0 && <Pill tone="bad">{issues} issue{issues === 1 ? '' : 's'}</Pill>}
            </div>
          </div>
          <p className="mb-2 text-xs text-slate-2">{grantLine(grant, pace)}</p>
          <PacingBar pace={pace} />
          <Link to="?tab=budget" className="mt-3 inline-block text-sm text-link hover:underline">Open budget & spending →</Link>
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
