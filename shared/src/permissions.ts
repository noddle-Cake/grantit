import type { FactCategory, Role } from './types.ts'

export type Action =
  | 'grant:configure'
  | 'application:draft'
  | 'application:approve'
  | 'fact:edit'
  | 'fact:approve'
  | 'finance:review'
  | 'finance:import'

const MATRIX: Record<Role, Action[]> = {
  director: ['grant:configure', 'application:draft', 'application:approve', 'fact:edit', 'fact:approve', 'finance:review', 'finance:import'],
  finance: ['finance:review', 'finance:import', 'fact:edit'],
  program: ['fact:edit', 'fact:approve', 'application:draft'],
}

export const can = (role: Role, action: Action) => MATRIX[role].includes(action)

/** Program staff may only approve program-side facts. */
export function canApproveFact(role: Role, category: FactCategory) {
  if (role === 'director') return true
  if (role === 'program') return ['program', 'service', 'beneficiaries', 'outcome'].includes(category)
  return false
}

export const ROLE_LABEL: Record<Role, string> = {
  director: 'Director',
  finance: 'Finance',
  program: 'Program staff',
}

export const ROLE_SUMMARY: Record<Role, string> = {
  director: 'Configures grants, drafts applications, approves information',
  finance: 'Reviews transactions, categories, and spending compliance',
  program: 'Contributes and approves program information',
}
