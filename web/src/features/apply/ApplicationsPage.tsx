import clsx from 'clsx'
import { FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { stageMeta } from '@/lib/labels'
import { Card, EmptyState, Meter, PageHeader, Pill, StatusPill } from '@/components/ui'
import { checkApplication } from '@grantit/shared/drafting'
import { daysUntil, money, relativeDay } from '@grantit/shared/format'
import type { Grant } from '@grantit/shared/types'
import { useStore } from '@/store'

const ORDER = { drafting: 0, prospect: 1, submitted: 2 } as Record<string, number>

const nextApplicationDeadline = (g: Grant) =>
  g.deadlines.filter((d) => d.kind === 'application' && !d.done).sort((a, b) => a.date.localeCompare(b.date))[0]

/** Every application in progress, with how close it is to ready: answers, approvals, and problems to fix. */
export default function Applications() {
  const { state } = useStore()
  const grants = state.grants
    .filter((g) => g.stage in ORDER)
    .sort((a, b) => ORDER[a.stage] - ORDER[b.stage] || (nextApplicationDeadline(a)?.date ?? '9').localeCompare(nextApplicationDeadline(b)?.date ?? '9'))

  return (
    <>
      <PageHeader eyebrow="Find & apply" title="Applications" subtitle="Each application's questions, drafted answers, and what still blocks submission." />

      {grants.length === 0 ? (
        <EmptyState icon={<FileText />} title="No applications in progress">
          Add a prospect from <Link to="/apply" className="text-link">Opportunities</Link> to start one.
        </EmptyState>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-slate-2">
                <tr className="border-b border-line-2">
                  <th className="px-5 py-3">Application</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3 text-right">Requested</th>
                  <th className="w-52 px-4 py-3">Answers</th>
                  <th className="px-4 py-3">To fix</th>
                  <th className="px-4 py-3">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-2">
                {grants.map((g) => {
                  const c = checkApplication(g.questions, state.facts)
                  const answered = g.questions.length - c.unanswered
                  const approved = g.questions.filter((q) => q.status === 'approved').length
                  const gaps = g.questions.reduce((n, q) => n + q.missing.length, 0)
                  const problems = [
                    c.unanswered > 0 && `${c.unanswered} unanswered`,
                    c.overLimit > 0 && `${c.overLimit} over word limit`,
                    c.unsupported > 0 && `${c.unsupported} unsupported claim${c.unsupported > 1 ? 's' : ''}`,
                    gaps > 0 && `${gaps} missing fact${gaps > 1 ? 's' : ''}`,
                    c.unapproved > 0 && `${c.unapproved} awaiting approval`,
                  ].filter(Boolean) as string[]
                  const due = nextApplicationDeadline(g)
                  return (
                    <tr key={g.id} className="hover:bg-canvas">
                      <td className="px-5 py-3">
                        <Link to={`/grants/${g.id}?tab=application`} className="flex items-center gap-3">
                          <span className={clsx('h-8 w-8 shrink-0 rounded-lg', `cover-${g.cover}`)} />
                          <span>
                            <span className="block font-medium text-link hover:underline">{g.name}</span>
                            <span className="block text-xs text-slate-3">{g.funder}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3"><Pill tone={stageMeta(g.stage).tone} dot>{stageMeta(g.stage).label}</Pill></td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(g.amount)}</td>
                      <td className="px-4 py-3">
                        {g.questions.length ? (
                          <>
                            <Meter value={answered} max={g.questions.length} height={6} />
                            <div className="mt-1 text-xs tabular-nums text-slate-3">{answered}/{g.questions.length} answered · {approved} approved</div>
                          </>
                        ) : (
                          <Link to={`/grants/${g.id}?tab=setup`} className="text-xs text-link hover:underline">Add the funder's questions</Link>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {g.stage === 'submitted' ? (
                          <span className="text-xs text-slate-3">Submitted</span>
                        ) : c.ready ? (
                          <StatusPill tone="good">Ready to submit</StatusPill>
                        ) : problems.length ? (
                          <span className="text-xs text-slate-2">{problems.join(' · ')}</span>
                        ) : (
                          <span className="text-xs text-slate-3">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {due ? (
                          <span className={clsx('text-sm', daysUntil(due.date) <= 14 ? 'font-medium text-brand-dark' : 'text-slate-2')}>{relativeDay(due.date)}</span>
                        ) : (
                          <span className="text-slate-3">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}
