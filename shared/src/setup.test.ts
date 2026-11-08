import { describe, expect, it } from 'vitest'
import { seedState } from './seed.ts'
import { canReceiveTransactions, needsSetup, validateSetup, type SetupInput } from './setup.ts'

const base: SetupInput = {
  amount: 60000,
  periodStart: '2026-10-01',
  periodEnd: '2027-09-30',
  funderFiscalYearStartMonth: 10,
  categories: [
    { id: 'a', name: 'Counselors', budget: 40000 },
    { id: 'b', name: 'Family Support', budget: 20000 },
  ],
}

describe('needsSetup / canReceiveTransactions', () => {
  const byId = (id: string) => seedState.grants.find((g) => g.id === id)!

  it('marks only the unconfirmed awarded grant as needing setup', () => {
    expect(seedState.grants.filter(needsSetup).map((g) => g.id)).toEqual(['g-family-wellness'])
  })

  it('lets confirmed funded grants with a budget receive transactions', () => {
    expect(canReceiveTransactions(byId('g-anchor'))).toBe(true)
    expect(canReceiveTransactions(byId('g-camp'))).toBe(true) // closed but confirmed
    expect(canReceiveTransactions(byId('g-family-wellness'))).toBe(false)
    expect(canReceiveTransactions(byId('g-wellness'))).toBe(false) // still drafting
  })
})

describe('validateSetup', () => {
  it('accepts a balanced setup', () => {
    expect(validateSetup(base)).toMatchObject({ ok: true, issues: [], budgetTotal: 60000, difference: 0 })
  })

  // Acceptance 7
  it('rejects budgets that do not sum exactly to the award', () => {
    const check = validateSetup({
      ...base,
      amount: 100,
      categories: [
        { id: 'a', name: 'A', budget: 33.33 },
        { id: 'b', name: 'B', budget: 33.33 },
        { id: 'c', name: 'C', budget: 33.33 },
      ],
    })
    expect(check.ok).toBe(false)
    expect(check.budgetTotal).toBe(99.99)
    expect(check.difference).toBe(0.01)
    expect(check.issues.map((i) => i.message)).toContain('Budgets are $0.01 short of the award.')
  })

  it('accepts cents that add up exactly', () => {
    const check = validateSetup({ ...base, amount: 0.3, categories: [{ id: 'a', name: 'A', budget: 0.1 }, { id: 'b', name: 'B', budget: 0.2 }] })
    expect(check.ok).toBe(true)
  })

  it('requires the end date after the start date', () => {
    expect(validateSetup({ ...base, periodEnd: base.periodStart }).issues).toEqual([expect.objectContaining({ field: 'period' })])
  })

  it('requires at least one category, unique names and positive budgets', () => {
    expect(validateSetup({ ...base, categories: [] }).issues.map((i) => i.message)).toContain('Add at least one budget category.')
    const dupes = validateSetup({ ...base, categories: [{ id: 'a', name: 'Travel', budget: 30000 }, { id: 'b', name: ' travel ', budget: 30000 }] })
    expect(dupes.issues).toEqual([expect.objectContaining({ categoryId: 'b', message: '“travel” is listed twice.' })])
    const zero = validateSetup({ ...base, categories: [{ id: 'a', name: 'Travel', budget: 60000 }, { id: 'b', name: 'Food', budget: 0 }] })
    expect(zero.issues).toEqual([expect.objectContaining({ categoryId: 'b' })])
  })

  it('rejects an invalid funder fiscal-year month', () => {
    expect(validateSetup({ ...base, funderFiscalYearStartMonth: 13 }).issues).toEqual([expect.objectContaining({ field: 'funderFiscalYearStartMonth' })])
  })
})
