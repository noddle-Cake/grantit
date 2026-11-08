import type { Actor, NextStep } from '@grantit/shared/applications'
import { can } from '@grantit/shared/permissions'
import type { Grant, User } from '@grantit/shared/types'

/**
 * The person who takes the next step: the owner for writing and fixes, otherwise someone with the right
 * permission, preferring the viewer when they have it (so "Your turn" shows for every director).
 */
export function whoActs(actor: Actor | undefined, g: Pick<Grant, 'ownerId'>, users: User[], me: User): User | undefined {
  if (!actor) return undefined
  if (actor === 'owner') return users.find((u) => u.id === g.ownerId)
  const action = actor === 'approver' ? 'application:approve' : 'grant:configure'
  return can(me.role, action) ? me : users.find((u) => can(u.role, action))
}

/** Where to pick the application up: setup when there are no questions, else the first question with the problem. */
export function nextStepHref(g: Pick<Grant, 'id' | 'questions' | 'stage'>, next: Pick<NextStep, 'questionId'>): string {
  const inactive = g.stage === 'submitted' || g.stage === 'declined'
  const tab = g.questions.length || inactive ? 'application' : 'setup'
  return `/grants/${g.id}?tab=${tab}${next.questionId ? `#q-${next.questionId}` : ''}`
}
