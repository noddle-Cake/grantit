import { checkApplication, type ApplicationCheck } from './drafting.ts'
import { parseDate } from './format.ts'
import type { Deadline, Fact, Grant } from './types.ts'

/** Applications this close to their deadline that are not ready count as at risk. */
export const AT_RISK_DAYS = 14

type AppGrant = Pick<Grant, 'stage' | 'questions' | 'deadlines'>

const isActive = (g: Pick<Grant, 'stage'>) => g.stage === 'prospect' || g.stage === 'drafting'

/** The earliest application deadline that is not done yet. */
export const nextApplicationDeadline = (g: Pick<Grant, 'deadlines'>): Deadline | undefined =>
  g.deadlines.filter((d) => d.kind === 'application' && !d.done).sort((a, b) => a.date.localeCompare(b.date))[0]

export interface NextStep {
  /** What has to happen next, in plain words. */
  text: string
  /** True when every check passes and the application can be submitted. */
  ready: boolean
  check: ApplicationCheck
}

/**
 * The single most important next step for an application. Blockers come in the order they must be fixed:
 * questions first, then word limits and unsupported claims (which make an answer unusable), then gaps,
 * then approvals.
 */
export function applicationNextStep(g: AppGrant, facts: Fact[]): NextStep {
  const check = checkApplication(g.questions, facts)
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  const text =
    g.stage === 'submitted' ? 'Awaiting a decision'
    : g.stage === 'declined' ? 'Application declined'
    : !g.questions.length ? "Add the funder's questions"
    : check.overLimit ? `${check.overLimit} over word limit`
    : check.unsupported ? plural(check.unsupported, 'unsupported claim')
    : check.unanswered ? `${check.unanswered} unanswered`
    : check.unapproved ? `${plural(check.unapproved, 'answer')} awaiting approval`
    : 'Ready to submit'
  return { text, ready: isActive(g) && check.ready, check }
}

const daysBetween = (from: string, to: string) => Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000)

/** In progress, due within {@link AT_RISK_DAYS} (or overdue), and not ready to submit. */
export function isAtRisk(g: AppGrant, facts: Fact[], today: string): boolean {
  if (!isActive(g)) return false
  const due = nextApplicationDeadline(g)
  if (!due || daysBetween(today, due.date) > AT_RISK_DAYS) return false
  return !applicationNextStep(g, facts).ready
}

/** Soonest application deadline first; undated applications last. */
export const byApplicationDeadline = (a: Pick<Grant, 'deadlines'>, b: Pick<Grant, 'deadlines'>) =>
  (nextApplicationDeadline(a)?.date ?? '9999').localeCompare(nextApplicationDeadline(b)?.date ?? '9999')
