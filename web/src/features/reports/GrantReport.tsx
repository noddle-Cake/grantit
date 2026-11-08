import clsx from 'clsx'
import { FileDown, FileSpreadsheet, FileText } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Segmented } from '@/components/ui'
import { periodOptions, type Period } from '@grantit/shared/finance'
import { fmtDate, moneyExact } from '@grantit/shared/format'
import { buildReport, unconfirmedInPeriod } from '@grantit/shared/funds'
import { downloadReportCsv, downloadReportPdf, downloadReportXlsx, REPORT_COLUMNS } from '@/lib/report'
import { useStore } from '@/store'
import type { Grant } from '@grantit/shared/types'

const key = (p: Pick<Period, 'start' | 'end'>) => `${p.start}|${p.end}`

/**
 * The funder report for one grant, in the funder's format: budget, spend this period, cumulative spend and what's
 * left per category, with charges that can't be reported listed separately. Rendered by both the Reports page and the grant's
 * Budget tab, so the two never disagree. `period` preselects a period (e.g. the quarter a due report covers).
 */
export function GrantReport({ grant, period: preset }: { grant: Grant; period?: Period }) {
  const { state, notify } = useStore()
  const base = periodOptions(grant, state.org.fiscalYearStartMonth)
  const options = preset && !base.some((o) => key(o) === key(preset)) ? [base[0], preset, ...base.slice(1)] : base
  const [selected, setSelected] = useState(() => key(preset ?? base[0]))
  // A new preset (e.g. picking another due report) wins over the earlier choice.
  const [lastPreset, setLastPreset] = useState(preset && key(preset))
  if (preset && key(preset) !== lastPreset) {
    setLastPreset(key(preset))
    setSelected(key(preset))
  }
  const period = options.find((o) => key(o) === selected) ?? options[0]
  const r = buildReport(grant, state.transactions, period)
  const unconfirmed = unconfirmedInPeriod(grant, state.transactions, period).length
  const excludedTotal = r.excluded.reduce((s, l) => s + Math.round(l.amount * 100), 0) / 100

  const run = async (label: string, fn: () => Promise<void> | void) => {
    try {
      await fn()
    } catch {
      notify(`Couldn't create the ${label} file. Try again.`, 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<string> label="Reporting period" value={key(period)} onChange={setSelected} options={options.map((o) => ({ id: key(o), label: o.short ?? o.label }))} />
        <span className="text-sm text-slate-2">{fmtDate(period.start)} – {fmtDate(period.end)}</span>
      </div>
      {period.kind !== 'grant' && (
        <p className="-mt-1 text-xs text-slate-2">
          {period.label}. Cumulative runs from the grant start to the end of this period. Over-budget flags are always checked against the full grant period.
        </p>
      )}

      {unconfirmed > 0 && (
        <p className="text-sm text-slate-2" role="status">
          {unconfirmed} unconfirmed item{unconfirmed === 1 ? '' : 's'} in this period.{' '}
          <Link to={`/funds/spending?grant=${grant.id}&from=${period.start}&to=${period.end}`} className="text-link hover:underline">Review them →</Link>
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-line-2">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-slate-2">
            <tr>
              {REPORT_COLUMNS.map((c, i) => <th key={c} className={clsx('px-3 py-2.5', i === 0 ? 'w-[32%]' : 'text-right')}>{c}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-2">
            {r.rows.map((x) => (
              <tr key={x.id}>
                <td className="px-3 py-2.5 font-medium text-slate">{x.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-2">{moneyExact(x.budget)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{moneyExact(x.thisPeriod)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{moneyExact(x.cumulative)}</td>
                <td className={clsx('px-3 py-2.5 text-right tabular-nums', x.remaining < 0 && 'font-medium text-bad')}>{moneyExact(x.remaining)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line bg-canvas font-semibold">
            <tr>
              <td className="px-3 py-2.5">Total</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{moneyExact(r.totals.budget)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{moneyExact(r.totals.thisPeriod)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{moneyExact(r.totals.cumulative)}</td>
              <td className={clsx('px-3 py-2.5 text-right tabular-nums', r.totals.remaining < 0 && 'text-bad')}>{moneyExact(r.totals.remaining)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {r.excluded.length > 0 && (
        <div className="rounded-lg border border-line-2 bg-canvas px-4 py-3">
          <h4 className="text-sm font-semibold text-slate">Excluded from this report <span className="font-normal text-slate-2">· {moneyExact(excludedTotal)}</span></h4>
          <p className="text-xs text-slate-2">These are left out of every figure above.</p>
          <ul className="mt-2 divide-y divide-line-2 text-sm">
            {r.excluded.map((l) => (
              <li key={`${l.tx.id}-${l.alloc.budgetLineId}`} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                <span className="w-24 shrink-0 text-xs text-slate-3">{fmtDate(l.tx.date)}</span>
                <span className="min-w-0 flex-1 text-slate">{l.tx.description} <span className="text-slate-3">· {l.tx.vendor}</span></span>
                <span className="text-xs text-bad">{l.detail}</span>
                <span className="w-24 text-right tabular-nums text-slate">{moneyExact(l.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={<FileSpreadsheet size={14} />} onClick={() => run('Excel', () => downloadReportXlsx(grant, state.org.name, r))}>Export Excel</Button>
        <Button size="sm" variant="secondary" icon={<FileText size={14} />} onClick={() => run('PDF', () => downloadReportPdf(grant, state.org.name, r))}>Export PDF</Button>
        <Button size="sm" variant="ghost" icon={<FileDown size={14} />} onClick={() => run('CSV', () => downloadReportCsv(grant, state.org.name, r))}>CSV</Button>
      </div>
    </div>
  )
}
