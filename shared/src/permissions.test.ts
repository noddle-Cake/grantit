import { describe, expect, it } from 'vitest'
import { can, canApproveFact } from './permissions.ts'
import { FACT_CATEGORIES } from './types.ts'

describe('canApproveFact', () => {
  it('lets each role approve the facts it owns', () => {
    const approvable = (role: 'director' | 'program' | 'finance') => FACT_CATEGORIES.filter((c) => canApproveFact(role, c))
    expect(approvable('director')).toEqual([...FACT_CATEGORIES])
    expect(approvable('program')).toEqual(['program', 'service', 'beneficiaries', 'outcome'])
    expect(approvable('finance')).toEqual(['finance'])
  })

  it('gives every role that approves some category the fact:approve action', () => {
    for (const role of ['director', 'program', 'finance'] as const)
      expect(can(role, 'fact:approve')).toBe(FACT_CATEGORIES.some((c) => canApproveFact(role, c)))
  })
})
