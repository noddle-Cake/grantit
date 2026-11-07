// ─── Domain model ───────────────────────────────────────────────────────────
// Framework-free and shared by the web app and the API. Enumerations are const
// arrays so the database schema and request validation use the same values.

export const ROLES = ['director', 'finance', 'program'] as const
export type Role = (typeof ROLES)[number]

export interface User {
  id: string
  name: string
  role: Role
  title: string
  initials: string
}

// 1. Organization knowledge base ------------------------------------------------

export const FACT_CATEGORIES = ['mission', 'program', 'service', 'beneficiaries', 'outcome', 'organization', 'finance'] as const
export type FactCategory = (typeof FACT_CATEGORIES)[number]

export const FACT_STATUSES = ['draft', 'pending', 'approved'] as const
export type FactStatus = (typeof FACT_STATUSES)[number]

export interface Fact {
  id: string
  category: FactCategory
  title: string
  content: string
  tags: string[]
  status: FactStatus
  source?: string
  updatedAt: string
  updatedBy: string
  approvedBy?: string
  approvedAt?: string
}

export const DOCUMENT_KINDS = ['application', 'report'] as const
export const DOCUMENT_OUTCOMES = ['awarded', 'declined', 'submitted'] as const

export interface PastDocument {
  id: string
  name: string
  kind: (typeof DOCUMENT_KINDS)[number]
  funder: string
  year: number
  outcome?: (typeof DOCUMENT_OUTCOMES)[number]
}

// 2. Grant configuration --------------------------------------------------------

export const GRANT_STAGES = ['prospect', 'drafting', 'submitted', 'awarded', 'reporting', 'closed', 'declined'] as const
export type GrantStage = (typeof GRANT_STAGES)[number]

export interface BudgetCategory {
  id: string
  name: string
  budget: number
}

export const ANSWER_STATUSES = ['empty', 'draft', 'approved'] as const
export type AnswerStatus = (typeof ANSWER_STATUSES)[number]

export interface Question {
  id: string
  prompt: string
  wordLimit: number
  answer: string
  citations: string[] // fact ids
  status: AnswerStatus
  missing: string[] // information gaps flagged by the drafter
  updatedAt?: string
}

export const DEADLINE_KINDS = ['application', 'report', 'other'] as const

export interface Deadline {
  id: string
  label: string
  date: string // ISO date
  kind: (typeof DEADLINE_KINDS)[number]
  done?: boolean
}

export interface Grant {
  id: string
  name: string
  funder: string
  amount: number
  stage: GrantStage
  cover: number
  ownerId: string
  periodStart: string
  periodEnd: string
  deadlines: Deadline[]
  rules: string[]
  categories: BudgetCategory[]
  questions: Question[]
  allowSplit: boolean
}

// 4. Accounting ----------------------------------------------------------------

export interface Allocation {
  grantId: string
  category: string // category name as imported / assigned
  amount: number
}

export const TRANSACTION_SOURCES = ['csv', 'quickbooks-sample', 'manual'] as const

export interface Transaction {
  id: string
  date: string
  vendor: string
  description: string
  account: string
  amount: number
  allocations: Allocation[]
  reviewed: boolean
  source: (typeof TRANSACTION_SOURCES)[number]
}

export type FlagKind = 'unassigned' | 'unauthorized-category' | 'over-budget' | 'outside-period' | 'split-not-allowed'

export interface TxFlag {
  kind: FlagKind
  grantId?: string
  message: string
}

// Organization -----------------------------------------------------------------

export interface Organization {
  id: string
  name: string
  ein: string
  fiscalYearStartMonth: number // 1-12
}

export interface AppState {
  org: Organization
  users: User[]
  currentUserId: string
  facts: Fact[]
  documents: PastDocument[]
  grants: Grant[]
  transactions: Transaction[]
}
