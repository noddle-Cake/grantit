import { describe, expect, it } from 'vitest'
import { markDuplicates, mapHeaders, parseAmount, parseImportDate, prepareImport } from './import.ts'
import { seedState } from './seed.ts'
import type { Transaction } from './types.ts'

describe('mapHeaders', () => {
  // Acceptance 8
  it('maps QuickBooks export headers case-insensitively and ignores extra columns', () => {
    const m = mapHeaders(['Date', 'Transaction Type', 'Num', 'NAME', 'Memo/Description', 'Account', 'Split', 'Amount'])
    expect(m.columns).toEqual({ date: 0, vendor: 3, description: 4, account: 5, amount: 7 })
    expect(m.missing).toEqual([])
    expect(m.ignored).toEqual(['Transaction Type', 'Num', 'Split'])
  })

  it('accepts the other aliases and the Grantit template', () => {
    expect(mapHeaders(['payee', 'memo', 'split', 'amount', 'date']).columns).toEqual({ vendor: 0, description: 1, account: 2, amount: 3, date: 4 })
    expect(mapHeaders(['date', 'vendor', 'description', 'account', 'amount', 'grant', 'category']).missing).toEqual([])
  })

  it('reports missing required columns', () => {
    expect(mapHeaders(['Name', 'Memo']).missing).toEqual(['date', 'amount'])
  })
})

describe('parseAmount', () => {
  // Acceptance 8
  it('reads dollar signs, commas and parentheses', () => {
    expect(parseAmount('$1,234.56')).toBe(1234.56)
    expect(parseAmount('(45.00)')).toBe(-45)
    expect(parseAmount('($1,000)')).toBe(-1000)
    expect(parseAmount('-12.5')).toBe(-12.5)
    expect(parseAmount(' 800 ')).toBe(800)
  })

  it('returns null for anything that is not an amount', () => {
    for (const bad of ['', 'abc', '12.3.4', '$', '1,2a']) expect(parseAmount(bad)).toBeNull()
  })
})

describe('parseImportDate', () => {
  it('accepts ISO and US dates and rejects impossible ones', () => {
    expect(parseImportDate('2026-11-03')).toBe('2026-11-03')
    expect(parseImportDate('11/3/2026')).toBe('2026-11-03')
    expect(parseImportDate('02/30/2026')).toBeNull()
    expect(parseImportDate('Nov 3')).toBeNull()
  })
})

describe('duplicates', () => {
  const row = { date: '2026-11-03', vendor: 'Zoom', amount: 180, account: '7200 Software', description: 'Annual' }

  // Acceptance 9
  it('keeps identical rows within one file on the first import, and skips them all the second time', () => {
    const file = [row, { ...row }, { ...row, amount: 20 }]
    expect(markDuplicates(file, [])).toEqual([false, false, false])
    expect(markDuplicates(file, file)).toEqual([true, true, true])
  })

  it('matches regardless of case and spacing', () => {
    expect(markDuplicates([{ ...row, vendor: ' zoom ' }], [row])).toEqual([true])
  })

  it('imports the same CSV twice without adding anything the second time', () => {
    const csv = [
      ['Date', 'Name', 'Memo/Description', 'Account', 'Amount'],
      ['11/03/2026', 'Zoom', 'Annual', '7200 Software', '$180.00'],
      ['11/03/2026', 'Zoom', 'Annual', '7200 Software', '$180.00'],
      ['11/04/2026', 'Metro Transit', 'Bus passes', '6900 Client Support', '(25.00)'],
    ]
    const first = prepareImport(csv, seedState.grants, [], 'csv')
    expect(first.ready).toHaveLength(3)
    const ledger: Transaction[] = first.ready.map((t, i) => ({ ...t, id: `t${i}` }))
    const second = prepareImport(csv, seedState.grants, ledger, 'csv')
    expect(second.ready).toHaveLength(0)
    expect(second.duplicates).toBe(3)
  })
})

describe('prepareImport', () => {
  const headers = ['date', 'vendor', 'description', 'account', 'amount', 'grant', 'category']

  it('allocates rows to confirmed grants by category id', () => {
    const p = prepareImport([headers, ['2026-10-30', 'Payroll', 'OT', '6000', '800', 'Anchor Mentors 2026', 'mentor coordinator']], seedState.grants, [], 'csv')
    expect(p.ready[0].allocations).toEqual([{ grantId: 'g-anchor', budgetLineId: 'c1', amount: 800 }])
    expect(p.ready[0]).toMatchObject({ source: 'manual', status: 'suggested', origin: 'csv' })
  })

  it('imports a line the grant does not have as unassigned, with a warning', () => {
    const p = prepareImport([headers, ['2026-10-30', 'Shop', 'Laptop', '6800', '900', 'Anchor Mentors 2026', 'Equipment']], seedState.grants, [], 'csv')
    expect(p.ready[0]).toMatchObject({ allocations: [], source: 'auto', status: 'needs_input' })
    expect(p.rows[0].warning).toMatch(/no “Equipment” budget line/)
  })

  it('sets the program from a QuickBooks class', () => {
    const table = [['Date', 'Name', 'Account', 'Amount', 'Class'], ['2026-10-30', 'Shop', '6400', '9', 'mentoring'], ['2026-10-31', 'Shop', '6400', '9', 'Unknown']]
    expect(prepareImport(table, seedState.grants, [], 'csv', seedState.programs).ready.map((t) => t.programId)).toEqual(['p-mentoring', undefined])
  })

  it('imports rows for a grant that needs setup as unassigned, with a warning', () => {
    const p = prepareImport([headers, ['2026-10-30', 'Shop', 'Books', '6400', '50', 'Family Wellness Partnership', 'Supplies']], seedState.grants, [], 'csv')
    expect(p.ready[0].allocations).toEqual([])
    expect(p.rows[0].warning).toMatch(/needs setup/)
  })

  it('skips malformed rows with a reason and reports missing columns', () => {
    const p = prepareImport([headers, ['not a date', 'X', '', '', '5', '', ''], ['2026-10-01', 'Y', '', '', 'five', '', '']], seedState.grants, [], 'csv')
    expect(p.ready).toEqual([])
    expect(p.errors).toHaveLength(2)
    expect(prepareImport([['Name', 'Memo'], ['a', 'b']], seedState.grants, [], 'csv').missingColumns).toEqual(['date', 'amount'])
  })
})
