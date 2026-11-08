import { describe, expect, it } from 'vitest'
import { EMPTY_AWARD_LETTER, parseAwardLetter } from './award-letter.ts'

const good = {
  funder: 'Harborlight Community Trust',
  amount: 60000,
  periodStart: '2026-10-01',
  periodEnd: '2027-09-30',
  funderFiscalYearStartMonth: 10,
  categories: [
    { name: 'Family Counselors', budget: 38000 },
    { name: 'Wellness Workshops', budget: 12000 },
  ],
}

describe('parseAwardLetter', () => {
  it('accepts a complete, valid response (object or JSON text)', () => {
    expect(parseAwardLetter(good)).toEqual({ fields: good, problems: [] })
    expect(parseAwardLetter(JSON.stringify(good)).fields).toEqual(good)
  })

  // Acceptance 10
  it('turns malformed output into empty fields without throwing', () => {
    for (const raw of ['not json {', '[1,2]', 42, null, undefined, '"text"']) {
      const parsed = parseAwardLetter(raw)
      expect(parsed.fields).toEqual(EMPTY_AWARD_LETTER)
      expect(parsed.problems.length).toBeGreaterThan(0)
    }
  })

  it('keeps valid fields and empties invalid or missing ones', () => {
    const { fields, problems } = parseAwardLetter({
      amount: '60,000', // a string, not a number
      periodStart: '2026-10-01',
      periodEnd: '2027-02-30', // impossible date
      funderFiscalYearStartMonth: 13,
      categories: [{ name: 'Counselors', budget: 38000 }, { name: '', budget: 5 }, { name: 'Travel', budget: -1 }, 'junk'],
    })
    expect(fields).toEqual({
      funder: null,
      amount: null,
      periodStart: '2026-10-01',
      periodEnd: null,
      funderFiscalYearStartMonth: null,
      categories: [{ name: 'Counselors', budget: 38000 }],
    })
    expect(problems).toHaveLength(6)
  })

  it('treats nulls as "not stated" without complaint', () => {
    expect(parseAwardLetter({ ...good, amount: null, categories: null })).toEqual({ fields: { ...good, amount: null, categories: null }, problems: [] })
  })

  it('rejects fractions of a cent rather than rounding them', () => {
    expect(parseAwardLetter({ amount: 100.005 }).fields.amount).toBeNull()
  })
})
