import { describe, expect, it } from 'vitest'
import { answerReady, applicationNextStep, byApplicationDeadline, isAtRisk, nextApplicationDeadline } from './applications.ts'
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
    expect(applicationNextStep(app({ questions: [q({ status: 'draft' }), q({ id: 'q2', status: 'draft' })] }), facts).text).toBe('2 answers to approve')
  })

  it('says who acts next and which question to open', () => {
    expect(applicationNextStep(app({ questions: [] }), facts)).toMatchObject({ actor: 'configurer', questionId: undefined })
    const questions = [q({ id: 'done' }), q({ id: 'blank', answer: '' }), q({ id: 'long', wordLimit: 1, status: 'draft' })]
    expect(applicationNextStep(app({ questions }), facts)).toMatchObject({ actor: 'owner', questionId: 'long' })
    expect(applicationNextStep(app({ questions: questions.slice(0, 2) }), facts)).toMatchObject({ actor: 'owner', questionId: 'blank' })
    expect(applicationNextStep(app({ questions: [q({ id: 'a' }), q({ id: 'b', status: 'draft' })] }), facts)).toMatchObject({ actor: 'approver', questionId: 'b' })
    expect(applicationNextStep(app(), facts).actor).toBeUndefined()
    expect(applicationNextStep(app({ stage: 'submitted' }), facts).actor).toBeUndefined()
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

describe('answerReady', () => {
  it('needs an approved answer within its limit and free of unsupported figures', () => {
    expect(answerReady(q(), facts)).toBe(true)
    expect(answerReady(q({ status: 'draft' }), facts)).toBe(false)
    expect(answerReady(q({ wordLimit: 1 }), facts)).toBe(false)
    expect(answerReady(q({ answer: 'We served 400 families.' }), facts)).toBe(false)
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
