import clsx from 'clsx'
import { CheckCircle2, Circle, Download, FileBarChart2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { stageMeta } from '@/lib/labels'
import { MonthlySpendChart } from '@/components/MonthlySpendChart'
import { DeadlineTimeline } from '@/components/DeadlineTimeline'
import { collectDeadlines } from '@grantit/shared/deadlines'
import { Button, Card, EmptyState, Meter, PageHeader, Pill, Segmented, Select, StatusPill } from '@/components/ui'
import { checkApplication } from '@grantit/shared/drafting'
import { computeFinancials, periodOptions } from '@grantit/shared/finance'
import { fmtDate, money, pct } from '@grantit/shared/format'
import { downloadFile, expenditureReportCsv } from '@/lib/report'
import { useStore } from '@/store'

export default function Reports() {
  const { state, flags } = useStore()
  const reportable = state.grants.filter((g) => g.categories.length && ['awarded', 'reporting', 'closed'].includes(g.stage))
  const [grantId, setGrantId] = useState(reportable[0]?.id ?? '')
  const [pIdx, setPIdx] = useState(0)
  const grant = state.grants.find((g) => g.id === grantId)

  if (!grant) return <EmptyState icon={<FileBarChart2 />} title="No reportable grants yet" />

  const options = periodOptions(grant, state.org.fiscalYearStartMonth)
  const period = options[pIdx] ?? options[0]
  const f = computeFinancials(grant, state.transactions, period)
  const grantFlags = state.transactions.filter((t) => t.allocations.some((a) => a.grantId === grant.id) && flags.get(t.id)?.some((x) => x.grantId === grant.id))
  const unreviewed = state.transactions.filter((t) => t.allocations.some((a) => a.grantId === grant.id) && !t.reviewed)

  // Workflow tracker (P1): status of application, narrative, financial checks, report.
  const appCheck = checkApplication(grant.questions, state.facts)
  const steps = [
    { label: 'Application', done: grant.questions.length === 0 || appCheck.ready || ['awarded', 'reporting', 'closed'].includes(grant.stage) },
    { label: 'Transactions reviewed', done: unreviewed.length === 0 },
    { label: 'Compliance checks', done: grantFlags.length === 0 },
    { label: 'Report submitted', done: grant.deadlines.filter((d) => d.kind === 'report').every((d) => d.done) },
  ]

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Grant-specific expenditure reports in each funder's reporting period."
        actions={
          <Button icon={<Download size={16} />} onClick={() => downloadFile(`${grant.name.replace(/\W+/g, '-')}-expenditures.csv`, expenditureReportCsv(grant, state.transactions, period))}>
            Export CSV
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Select value={grantId} onChange={(e) => { setGrantId(e.target.value); setPIdx(0) }} className="!h-9 !w-72 !bg-white">
          {reportable.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <Segmented<string>
          value={String(pIdx)}
          onChange={(v) => setPIdx(Number(v))}
          options={options.map((o, i) => ({ id: String(i), label: i === 0 ? 'Funder period' : o.label.replace('Org fiscal year ', '') }))}
        />
        <span className="text-sm text-slate-2">{fmtDate(period.start)} – {fmtDate(period.end)}</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* Report document preview */}
          <Card padded={false}>
            <div className={clsx('h-2 rounded-t-lg', `cover-${grant.cover}`)} />
            <div className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-3">Expenditure report</div>
                  <h2 className="mt-1 text-xl font-semibold text-slate">{grant.name}</h2>
                  <div className="text-sm text-slate-2">{grant.funder} · {state.org.name}</div>
                </div>
                <Pill tone={stageMeta(grant.stage).tone} dot>{stageMeta(grant.stage).label}</Pill>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4 border-y border-line-2 py-4">
                <div><div className="text-xs text-slate-3">Approved budget</div><div className="text-lg font-semibold tabular-nums">{money(f.budget)}</div></div>
                <div><div className="text-xs text-slate-3">Expended</div><div className="text-lg font-semibold tabular-nums">{money(f.spent)} <span className="text-sm font-normal text-slate-3">{pct(f.ratio)}</span></div></div>
                <div><div className="text-xs text-slate-3">Balance</div><div className={clsx('text-lg font-semibold tabular-nums', f.remaining < 0 && 'text-bad')}>{money(f.remaining)}</div></div>
              </div>

              <h3 className="mb-3 mt-6 text-sm font-semibold text-slate">Expenditure by category</h3>
              <div className="space-y-3">
                {f.categories.map((c) => (
                  <div key={c.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm sm:grid-cols-[160px_1fr_200px]">
                    <span className="text-slate">{c.name}</span>
                    <span className="text-right tabular-nums text-slate sm:order-last">{money(c.spent)} <span className="text-slate-3">/ {money(c.budget)}</span></span>
                    <div className="col-span-2 flex items-center sm:col-span-1"><Meter value={c.spent} max={c.budget} /></div>
                  </div>
                ))}
                {f.unauthorized.map((u) => (
                  <div key={u.category} className="flex justify-between rounded-lg bg-bad-soft px-3 py-2 text-sm">
                    <span className="text-bad">{u.category} — not an approved category</span>
                    <span className="tabular-nums text-bad">{money(u.spent)}</span>
                  </div>
                ))}
              </div>

              <h3 className="mb-2 mt-8 text-sm font-semibold text-slate">Monthly expenditure</h3>
              <MonthlySpendChart data={f.byMonth} height={200} />
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Reporting checklist">
            <ol className="space-y-3">
              {steps.map((s) => (
                <li key={s.label} className="flex items-center gap-3 text-sm">
                  {s.done ? <CheckCircle2 size={18} className="text-good" /> : <Circle size={18} className="text-line" />}
                  <span className={s.done ? 'text-slate' : 'text-slate-2'}>{s.label}</span>
                </li>
              ))}
            </ol>
            {(grantFlags.length > 0 || unreviewed.length > 0) && (
              <div className="mt-4 space-y-2 border-t border-line-2 pt-4">
                {grantFlags.length > 0 && <Link to={`/transactions?view=flagged&grant=${grant.id}`} className="block"><StatusPill tone="bad">{grantFlags.length} flagged transactions</StatusPill></Link>}
                {unreviewed.length > 0 && <Link to={`/transactions?view=unreviewed&grant=${grant.id}`} className="block"><StatusPill tone="warn">{unreviewed.length} awaiting review</StatusPill></Link>}
              </div>
            )}
          </Card>
          <Card title="Reporting obligations">
            <DeadlineTimeline items={collectDeadlines(state.grants, { includeDone: true }).filter((x) => x.deadline.kind === 'report')} />
          </Card>
        </div>
      </div>
    </>
  )
}
