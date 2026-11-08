import { checkApplication, findUnsupportedClaims, newlyCovered, type ApplicationCheck } from './drafting.ts'
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

/** Unapproved answers whose last draft lacked facts that have since been approved. */
export const regenerable = (g: Pick<Grant, 'questions'>, facts: Fact[]): Question[] =>
  g.questions.filter((q) => q.status !== 'approved' && newlyCovered(q, facts).length > 0)

export interface PipelineSummary {
  inProgress: { count: number; amount: number }
  atRisk: number
  /** Written answers waiting for approval, and how many applications they're in. */
  toApprove: { answers: number; applications: number }
  submitted: { count: number; amount: number }
}

/** The figures for the summary at the top of Applications. */
export function pipelineSummary(grants: Pick<Grant, 'stage' | 'questions' | 'deadlines' | 'amount'>[], facts: Fact[], today: string): PipelineSummary {
  const active = grants.filter(isInProgress)
  const submitted = grants.filter((g) => g.stage === 'submitted')
  const sum = (gs: typeof grants) => gs.reduce((n, g) => n + g.amount, 0)
  const unapproved = active.map((g) => checkApplication(g.questions, facts).unapproved)
  return {
    inProgress: { count: active.length, amount: sum(active) },
    atRisk: active.filter((g) => isAtRisk(g, facts, today)).length,
    toApprove: { answers: unapproved.reduce((a, b) => a + b, 0), applications: unapproved.filter(Boolean).length },
    submitted: { count: submitted.length, amount: sum(submitted) },
  }
}

// ─── Finance view ────────────────────────────────────────────────────────────

const MONEY_RULE = /indirect|overhead|match|cost[- ]?shar|budget|salar|equipment|capital|fiscal|year runs|\$|\d+\s?%/i

/** Funder rules that bear on money (indirect costs, match, budget limits, fiscal year), in their original order. */
export const moneyRules = (rules: string[]) => rules.filter((r) => MONEY_RULE.test(r))

export interface BudgetStatus {
  /** Sum of the drafted budget categories; 0 when none are drafted. */
  total: number
  categories: number
  /** True when a budget is drafted and adds up to the amount requested. */
  matchesRequest: boolean
}

export function budgetStatus(g: Pick<Grant, 'amount' | 'categories'>): BudgetStatus {
  const total = g.categories.reduce((n, c) => n + c.budget, 0)
  return { total, categories: g.categories.length, matchesRequest: g.categories.length > 0 && Math.round(total) === Math.round(g.amount) }
}

/** Soonest application deadline first; undated applications last. */
export const byApplicationDeadline = (a: Pick<Grant, 'deadlines'>, b: Pick<Grant, 'deadlines'>) =>
  (nextApplicationDeadline(a)?.date ?? '9999').localeCompare(nextApplicationDeadline(b)?.date ?? '9999')
