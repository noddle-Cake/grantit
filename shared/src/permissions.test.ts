import { describe, expect, it } from 'vitest'
import { can, canApproveDoc, canApproveFact } from './permissions.ts'
import { FACT_CATEGORIES, SOURCE_DOC_KINDS } from './types.ts'

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

describe('canApproveDoc', () => {
  it('lets directors approve any PDF, program staff program evidence, and finance the financials', () => {
    expect(SOURCE_DOC_KINDS.every((k) => canApproveDoc('director', k))).toBe(true)
    expect(SOURCE_DOC_KINDS.filter((k) => canApproveDoc('program', k))).toEqual(['evaluation', 'report', 'application'])
    expect(SOURCE_DOC_KINDS.filter((k) => canApproveDoc('finance', k))).toEqual(['financials'])
  })
})
