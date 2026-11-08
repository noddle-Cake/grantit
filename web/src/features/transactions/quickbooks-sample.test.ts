import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { prepareImport } from '@grantit/shared/import'
import { seedState } from '@grantit/shared/seed'
import sample from '../../../public/samples/quickbooks-sample.csv?raw'

// Guards the demo file served at /samples/quickbooks-sample.csv.
describe('QuickBooks sample CSV', () => {
  const table = Papa.parse<string[]>(sample, { skipEmptyLines: 'greedy' }).data

  it('has about 30 rows in QuickBooks export shape, with one bad row, one exact duplicate and one refund', () => {
    const first = prepareImport(table, seedState.grants, seedState.transactions, 'quickbooks-sample')
    expect(table.length - 1).toBe(30)
    expect(first.ignoredColumns).toEqual(['Transaction Type', 'Num', 'Split'])
    expect(first.errors).toEqual(['Row 27: “Nov 7” isn\'t a date (use YYYY-MM-DD or MM/DD/YYYY)'])
    expect(first.duplicates).toBe(0) // the two identical SimplePractice rows both import the first time
    expect(first.ready).toHaveLength(29)
    expect(first.ready.filter((t) => t.amount < 0).map((t) => t.amount)).toEqual([-320])
  })

  it('adds nothing when imported a second time', () => {
    const first = prepareImport(table, seedState.grants, seedState.transactions, 'quickbooks-sample')
    const ledger = [...seedState.transactions, ...first.ready.map((t, i) => ({ ...t, id: `imp-${i}` }))]
    const second = prepareImport(table, seedState.grants, ledger, 'quickbooks-sample')
    expect(second.ready).toEqual([])
    expect(second.duplicates).toBe(29)
  })
})
