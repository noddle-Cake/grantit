import { describe, expect, it } from 'vitest'
import { grantPeriod } from '@grantit/shared/finance'
import { buildReport } from '@grantit/shared/funds'
import { seedState } from '@grantit/shared/seed'
import type { Transaction } from '@grantit/shared/types'
import { reportCsv, reportPdf, reportSheet, REPORT_COLUMNS } from './report'

const anchor = seedState.grants.find((g) => g.id === 'g-anchor')!
// A confirmed charge whose service date later moved past the period: the one way a seeded report gets an exclusion.
const lateCharge: Transaction = { ...seedState.transactions[0], id: 'late', description: 'Late invoice', serviceDate: '2027-02-01', amount: 1100, allocations: [{ grantId: anchor.id, budgetLineId: 'c3', amount: 1100 }] }
const report = buildReport(anchor, [...seedState.transactions, lateCharge], grantPeriod(anchor))
const ORG = seedState.org.name
const cellValue = (c: unknown) => (c && typeof c === 'object' && 'value' in c ? (c as { value: unknown }).value : c)

describe('report exports match the screen', () => {
  it('xlsx sheet has the report columns, every category, the $79,500 total and the exclusions', () => {
    const rows = reportSheet(anchor, ORG, report).data.map((r) => r.map(cellValue))
    expect(rows).toContainEqual([...REPORT_COLUMNS])
    for (const x of report.rows) expect(rows).toContainEqual([x.name, x.budget, x.thisPeriod, x.cumulative, x.remaining])
    expect(rows).toContainEqual(['Total', 96_000, 79_500, 79_500, 16_500])
    expect(rows.flat()).toContain('Excluded from this report')
    expect(rows.flat()).toContain('Outside the funding period')
  })

  it('PDF contains the same table and exclusions', async () => {
    const pdf = (await reportPdf(anchor, ORG, report)).output()
    for (const text of ['Expenditure report: Anchor Mentors 2026', 'This period', 'Cumulative', '$79,500.00', '$16,500.00', 'Excluded from this report', '$1,100.00'])
      expect(pdf).toContain(text)
  })

  it('CSV keeps the same columns and totals', () => {
    const csv = reportCsv(anchor, ORG, report)
    expect(csv).toContain('Category,Budget,This period,Cumulative,Remaining')
    expect(csv).toContain('Total,96000,79500,79500,16500')
  })
})
