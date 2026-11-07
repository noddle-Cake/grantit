import Papa from 'papaparse'
import type { Grant, Transaction } from '@grantit/shared/types'
import { computeFinancials, inPeriod, type Period } from '@grantit/shared/finance'

export function downloadFile(name: string, content: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Grant-specific expenditure report (category summary + line detail) as CSV. */
export function expenditureReportCsv(grant: Grant, txs: Transaction[], period: Period): string {
  const f = computeFinancials(grant, txs, period)
  const summary = Papa.unparse([
    ['Expenditure report', grant.name],
    ['Funder', grant.funder],
    ['Reporting period', `${period.start} to ${period.end} (${period.label})`],
    [],
    ['Category', 'Approved budget', 'Actual', 'Remaining', '% used'],
    ...f.categories.map((c) => [c.name, c.budget, c.spent, c.remaining, `${Math.round(c.ratio * 100)}%`]),
    ...f.unauthorized.map((u) => [`${u.category} (UNAUTHORIZED)`, 0, u.spent, -u.spent, '']),
    ['Total', f.budget, f.spent, f.remaining, `${Math.round(f.ratio * 100)}%`],
    [],
    ['Date', 'Vendor', 'Description', 'GL account', 'Category', 'Amount charged to grant'],
    ...txs
      .filter((t) => inPeriod(t.date, period))
      .flatMap((t) => t.allocations.filter((a) => a.grantId === grant.id).map((a) => [t.date, t.vendor, t.description, t.account, a.category, a.amount]))
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ])
  return summary
}
