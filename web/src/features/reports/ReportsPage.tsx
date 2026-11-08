import clsx from 'clsx'
import { CheckCircle2, FileBarChart2, Send } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, EmptyState, Pill, Select } from '@/components/ui'
import { fmtDate } from '@grantit/shared/format'
import { fundingState, markReportSubmitted, reviewQueue, type DueReport } from '@grantit/shared/funds'
import { can } from '@grantit/shared/permissions'
import { useFunds } from '@/features/funds/useFunds'
import { useStore } from '@/store'
import { GrantReport } from './GrantReport'

const dueLabel = (days: number) => (days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'Due today' : `${days} day${days === 1 ? '' : 's'} left`)

/** Reports start from what's due: pick an obligation and the right grant and period are already set. */
export default function Reports() {
  const { state, me, updateGrant, notify } = useStore()
  const { due, today } = useFunds()
  const reportable = state.grants.filter((g) => g.categories.length && fundingState(g, today) && fundingState(g, today) !== 'needs-setup')
  const [picked, setPicked] = useState<{ grantId: string; deadlineId?: string }>(() => (due[0] ? { grantId: due[0].grant.id, deadlineId: due[0].deadline.id } : { grantId: reportable[0]?.id ?? '' }))
  const grant = state.grants.find((g) => g.id === picked.grantId)
  if (!grant) return <EmptyState icon={<FileBarChart2 />} title="No reportable grants yet">Confirm an awarded grant's budget to start reporting on it.</EmptyState>

  // The obligation in focus: the one picked from Due next, or this grant's next open report.
  const current: DueReport | undefined = due.find((d) => d.grant.id === grant.id && (picked.deadlineId ? d.deadline.id === picked.deadlineId : true))
  const toReview = reviewQueue(state.grants, state.transactions, today, grant.id)
  const canSubmit = can(me.role, 'finance:review') || can(me.role, 'grant:configure')

  function submit(d: DueReport) {
    const patch = markReportSubmitted(d.grant, d.deadline.id, today)
    updateGrant(d.grant.id, patch)
    notify(patch.stage === 'closed' ? `${d.deadline.label} submitted. ${d.grant.name} is now closed.` : `${d.deadline.label} marked submitted`)
    setPicked({ grantId: d.grant.id })
  }

  return (
    <>
      <Card title="Due next" padded={false} className="mb-6">
        {due.length ? (
          <ul className="divide-y divide-line-2">
            {due.map((d) => {
              const active = d.grant.id === grant.id && d.deadline.id === current?.deadline.id
              return (
                <li key={`${d.grant.id}-${d.deadline.id}`}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPicked({ grantId: d.grant.id, deadlineId: d.deadline.id })}
                    className={clsx('grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-5 py-3 text-left hover:bg-canvas sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto]', active && 'bg-link-soft/60')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate">{d.grant.name}</span>
                      <span className="block truncate text-xs text-slate-3">{d.deadline.label} · due {fmtDate(d.deadline.date)}</span>
                    </span>
                    <span className="hidden text-xs text-slate-2 sm:block">Covers {fmtDate(d.period.start)} – {fmtDate(d.period.end)}</span>
                    <Pill tone={d.daysLeft < 0 ? 'bad' : d.daysLeft <= 30 ? 'warn' : 'neutral'}>{dueLabel(d.daysLeft)}</Pill>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-slate-3">No reports due. Add report deadlines on each grant's Setup tab.</p>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card padded={false}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-2 px-5 py-4">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-3">Expenditure report{current ? ` · ${current.deadline.label}` : ''}</div>
              <h2 className="mt-0.5 text-lg font-semibold text-slate">{grant.name}</h2>
              <div className="text-sm text-slate-2">{grant.funder} · {state.org.name}</div>
            </div>
            <Select aria-label="Report grant" value={grant.id} onChange={(e) => setPicked({ grantId: e.target.value })} className="!h-9 !w-64 !bg-surface">
              {reportable.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          <div className="p-5">
            <GrantReport key={grant.id} grant={grant} period={current?.period} />
          </div>
        </Card>

        <Card title="Before submitting">
          {toReview.count ? (
            <Link to={`/funds/spending?grant=${grant.id}`} className="block rounded-lg bg-warn-soft px-3 py-2.5 text-sm font-medium text-slate hover:underline">
              {toReview.count} item{toReview.count === 1 ? '' : 's'} to review before submitting →
            </Link>
          ) : (
            <p className="flex items-center gap-2 text-sm text-slate-2"><CheckCircle2 size={16} className="text-good" /> Nothing left to review for this grant.</p>
          )}
          {current ? (
            <div className="mt-4 border-t border-line-2 pt-4">
              <div className="text-sm text-slate">{current.deadline.label}</div>
              <div className="text-xs text-slate-3">Due {fmtDate(current.deadline.date)} · {dueLabel(current.daysLeft)}</div>
              {canSubmit && (
                <Button className="mt-3" size="sm" icon={<Send size={14} />} onClick={() => submit(current)}>Mark submitted</Button>
              )}
            </div>
          ) : (
            <p className="mt-4 border-t border-line-2 pt-4 text-sm text-slate-3">No open report deadline for this grant.</p>
          )}
        </Card>
      </div>
    </>
  )
}
