// ─── Domain model ───────────────────────────────────────────────────────────
// Kept framework-free so it can be shared with a future API layer.

export type Role = 'director' | 'finance' | 'program'

export interface User {
  id: string
  name: string
  role: Role
  title: string
  initials: string
}

// 1. Organization knowledge base ------------------------------------------------

export type FactCategory =
  | 'mission'
  | 'program'
  | 'service'
  | 'beneficiaries'
  | 'outcome'
  | 'organization'
  | 'finance'

export type FactStatus = 'draft' | 'pending' | 'approved'

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

export interface PastDocument {
  id: string
  name: string
  kind: 'application' | 'report'
  funder: string
  year: number
  outcome?: 'awarded' | 'declined' | 'submitted'
}

// 2. Grant configuration --------------------------------------------------------

export type GrantStage =
  | 'prospect'
  | 'drafting'
  | 'submitted'
  | 'awarded'
  | 'reporting'
  | 'closed'
  | 'declined'

export interface BudgetCategory {
  id: string
  name: string
  budget: number
}

export type AnswerStatus = 'empty' | 'draft' | 'approved'

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

export interface Deadline {
  id: string
  label: string
  date: string // ISO date
  kind: 'application' | 'report' | 'other'
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

export interface Transaction {
  id: string
  date: string
  vendor: string
  description: string
  account: string
  amount: number
  allocations: Allocation[]
  reviewed: boolean
  source: 'csv' | 'quickbooks-sample' | 'manual'
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
