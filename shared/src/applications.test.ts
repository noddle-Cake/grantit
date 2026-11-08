import { describe, expect, it } from 'vitest'
import { applicationNextStep, byApplicationDeadline, isAtRisk, nextApplicationDeadline } from './applications.ts'
import type { Deadline, Fact, Grant, Question } from './types.ts'

const TODAY = '2026-11-08'
const due = (date: string, extra: Partial<Deadline> = {}): Deadline => ({ id: date, label: 'Application due', date, kind: 'application', ...extra })
const q = (over: Partial<Question> = {}): Question => ({ id: 'q', prompt: 'Why?', wordLimit: 50, answer: 'We serve families.', citations: [], status: 'approved', missing: [], ...over })
const app = (over: Partial<Pick<Grant, 'stage' | 'questions' | 'deadlines'>> = {}) => ({ stage: 'drafting' as const, questions: [q()], deadlines: [due('2026-12-01')], ...over })
const facts: Fact[] = []

describe('nextApplicationDeadline', () => {
  it('picks the earliest open application deadline', () => {
    const g = { deadlines: [due('2026-12-10'), due('2026-11-20', { done: true }), due('2026-11-30'), { ...due('2026-11-10'), kind: 'report' as const }] }
    expect(nextApplicationDeadline(g)?.date).toBe('2026-11-30')
  })
})

describe('applicationNextStep', () => {
  it('names the first blocker in fixing order', () => {
    expect(applicationNextStep(app({ questions: [] }), facts).text).toBe("Add the funder's questions")
    expect(applicationNextStep(app({ questions: [q({ wordLimit: 1 })] }), facts).text).toBe('1 over word limit')
    expect(applicationNextStep(app({ questions: [q({ answer: '' })] }), facts).text).toBe('1 unanswered')
    expect(applicationNextStep(app({ questions: [q({ status: 'draft' }), q({ id: 'q2', status: 'draft' })] }), facts).text).toBe('2 answers awaiting approval')
  })

  it('is ready only for in-progress applications that pass every check', () => {
    expect(applicationNextStep(app(), facts)).toMatchObject({ text: 'Ready to submit', ready: true })
    expect(applicationNextStep(app({ stage: 'submitted' }), facts)).toMatchObject({ text: 'Awaiting a decision', ready: false })
  })
})

describe('isAtRisk', () => {
  const notReady = [q({ answer: '' })]
  it('flags in-progress applications due within 14 days, or overdue, that are not ready', () => {
    expect(isAtRisk(app({ questions: notReady, deadlines: [due('2026-11-22')] }), facts, TODAY)).toBe(true)
    expect(isAtRisk(app({ questions: notReady, deadlines: [due('2026-11-01')] }), facts, TODAY)).toBe(true)
  })

  it('ignores applications that are ready, later, undated, or no longer in progress', () => {
    expect(isAtRisk(app({ deadlines: [due('2026-11-12')] }), facts, TODAY)).toBe(false)
    expect(isAtRisk(app({ questions: notReady, deadlines: [due('2026-11-23')] }), facts, TODAY)).toBe(false)
    expect(isAtRisk(app({ questions: notReady, deadlines: [] }), facts, TODAY)).toBe(false)
    expect(isAtRisk(app({ stage: 'submitted', questions: notReady, deadlines: [due('2026-11-10')] }), facts, TODAY)).toBe(false)
  })
})

describe('byApplicationDeadline', () => {
  it('sorts soonest first and undated last, regardless of stage', () => {
    const later = { deadlines: [due('2027-01-10')] }
    const soon = { deadlines: [due('2026-11-20')] }
    const none = { deadlines: [] }
    expect([later, none, soon].sort(byApplicationDeadline)).toEqual([soon, later, none])
  })
})
