import { checkApplication, findUnsupportedClaims, type ApplicationCheck } from './drafting.ts'
import { parseDate, wordCount } from './format.ts'
import type { Deadline, Fact, Grant, Question } from './types.ts'

/** Applications this close to their deadline that are not ready count as at risk. */
export const AT_RISK_DAYS = 14

type AppGrant = Pick<Grant, 'stage' | 'questions' | 'deadlines'>

export const isInProgress = (g: Pick<Grant, 'stage'>) => g.stage === 'prospect' || g.stage === 'drafting'

/** The earliest application deadline that is not done yet. */
export const nextApplicationDeadline = (g: Pick<Grant, 'deadlines'>): Deadline | undefined =>
  g.deadlines.filter((d) => d.kind === 'application' && !d.done).sort((a, b) => a.date.localeCompare(b.date))[0]

/**
 * Who has to act on the next step:
 * - `owner`: the application's owner writes or fixes answers
 * - `approver`: someone allowed to approve answers (application:approve)
 * - `configurer`: someone allowed to set up the grant (grant:configure) adds the funder's questions
 */
export type Actor = 'owner' | 'approver' | 'configurer'

export interface NextStep {
  /** What has to happen next, in plain words. */
  text: string
  /** True when every check passes and the application can be submitted. */
  ready: boolean
  check: ApplicationCheck
  /** Who acts next; absent once submitted, declined, or ready. */
  actor?: Actor
  /** The first question with this problem, to link straight to it. */
  questionId?: string
}

const overLimit = (q: Question) => wordCount(q.answer) > q.wordLimit
const unanswered = (q: Question) => !q.answer.trim()

/** An answer is ready when it's written, within its limit, free of unsupported claims, and approved. */
export const answerReady = (q: Question, facts: Fact[]) =>
  !unanswered(q) && !overLimit(q) && q.status === 'approved' && findUnsupportedClaims(q.answer, facts).length === 0

/**
 * The single most important next step for an application, who takes it, and where. Blockers come in the
 * order they must be fixed: questions first, then word limits and unsupported claims (which make an answer
 * unusable), then unanswered questions, then approvals.
 */
export function applicationNextStep(g: AppGrant, facts: Fact[]): NextStep {
  const check = checkApplication(g.questions, facts)
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  const first = (test: (q: Question) => boolean) => g.questions.find(test)?.id
  const step = (text: string, actor?: Actor, questionId?: string): NextStep => ({ text, ready: isInProgress(g) && check.ready, check, actor, questionId })

  if (g.stage === 'submitted') return step('Awaiting a decision')
  if (g.stage === 'declined') return step('Application declined')
  if (!g.questions.length) return step("Add the funder's questions", 'configurer')
  if (check.overLimit) return step(`${check.overLimit} over word limit`, 'owner', first(overLimit))
  if (check.unsupported) return step(plural(check.unsupported, 'unsupported claim'), 'owner', first((q) => findUnsupportedClaims(q.answer, facts).length > 0))
  if (check.unanswered) return step(`${check.unanswered} unanswered`, 'owner', first(unanswered))
  if (check.unapproved) return step(`${plural(check.unapproved, 'answer')} to approve`, 'approver', first((q) => !unanswered(q) && q.status !== 'approved'))
  return step('Ready to submit')
}

const daysBetween = (from: string, to: string) => Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000)

/** In progress, due within {@link AT_RISK_DAYS} (or overdue), and not ready to submit. */
export function isAtRisk(g: AppGrant, facts: Fact[], today: string): boolean {
  if (!isInProgress(g)) return false
  const due = nextApplicationDeadline(g)
  if (!due || daysBetween(today, due.date) > AT_RISK_DAYS) return false
  return !applicationNextStep(g, facts).ready
}

/** Soonest application deadline first; undated applications last. */
export const byApplicationDeadline = (a: Pick<Grant, 'deadlines'>, b: Pick<Grant, 'deadlines'>) =>
  (nextApplicationDeadline(a)?.date ?? '9999').localeCompare(nextApplicationDeadline(b)?.date ?? '9999')
