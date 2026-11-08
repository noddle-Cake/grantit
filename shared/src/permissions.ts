import type { FactCategory, Role, SourceDocKind } from './types.ts'

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
  finance: ['finance:review', 'finance:import', 'fact:edit', 'fact:approve'],
  program: ['fact:edit', 'fact:approve', 'application:draft'],
}

export const can = (role: Role, action: Action) => MATRIX[role].includes(action)

/** Fact categories each role may approve. Staff approve the facts they own: program staff the program side, finance the finance side. */
const APPROVES: Record<Role, readonly FactCategory[] | 'all'> = {
  director: 'all',
  program: ['program', 'service', 'beneficiaries', 'outcome'],
  finance: ['finance'],
}

export function canApproveFact(role: Role, category: FactCategory) {
  const allowed = APPROVES[role]
  return allowed === 'all' || allowed.includes(category)
}

/** PDF kinds each role may approve as a drafting source: the same split as facts (finance owns the financials). */
const APPROVES_DOCS: Record<Role, readonly SourceDocKind[] | 'all'> = {
  director: 'all',
  program: ['evaluation', 'report', 'application'],
  finance: ['financials'],
}

export function canApproveDoc(role: Role, kind: SourceDocKind) {
  const allowed = APPROVES_DOCS[role]
  return allowed === 'all' || allowed.includes(kind)
}

export const ROLE_LABEL: Record<Role, string> = {
  director: 'Director',
  finance: 'Finance',
  program: 'Program staff',
}

export const ROLE_SUMMARY: Record<Role, string> = {
  director: 'Configures grants, drafts applications, approves information',
  finance: 'Reviews transactions, categories, and spending compliance; approves finance facts',
  program: 'Contributes and approves program information',
}
