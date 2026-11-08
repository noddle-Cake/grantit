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
  /** The organization's spending categories this budget line can pay for. */
  acceptedCategoryIds?: string[]
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
  /** ISO date the award's budget and period were confirmed. Awarded/reporting grants without it "need setup". */
  setupConfirmedAt?: string
  /** Month (1-12) the funder's fiscal year starts. Absent: the month the grant period starts. */
  funderFiscalYearStartMonth?: number
  /**
   * Largest share of a category's budget (in percent) that may be moved to another category without the funder's
   * written approval. Absent: any move needs approval.
   */
  rebudgetThresholdPct?: number
  /** Budget moves between categories, newest last. Category budgets already include them. */
  reallocations?: BudgetReallocation[]
  /** The program this award funds. Expenses coded to that program can be charged to it. */
  programId?: string
}

export interface BudgetReallocation {
  date: string // ISO date
  fromCategoryId: string
  toCategoryId: string
  amount: number
}

// 4. Accounting ----------------------------------------------------------------

/** A stable spending category from the organization's chart of accounts, independent of any grant's budget lines. */
export interface OrgCategory {
  id: string
  name: string
  glAccounts: string[]
}

export interface Program {
  id: string
  name: string
}

/** Part of a transaction paid from one grant budget line, or from General funds when `grantId` is null. */
export interface Allocation {
  grantId: string | null
  /** A budget line of that grant (ids are unique only within a grant). Absent for General funds. */
  budgetLineId?: string
  amount: number
}

/** Where a ledger line came from. */
export const TRANSACTION_ORIGINS = ['csv', 'quickbooks-sample', 'manual'] as const

/** Who chose the allocations: auto-assign, or a person. Auto-assign never changes a person's choice. */
export const ASSIGNMENT_SOURCES = ['auto', 'manual'] as const
export type AssignmentSource = (typeof ASSIGNMENT_SOURCES)[number]

export const TRANSACTION_STATUSES = ['needs_input', 'suggested', 'check_split', 'done'] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

export interface Transaction {
  id: string
  date: string
  vendor: string
  description: string
  account: string
  amount: number
  /** Organization spending category. */
  categoryId?: string
  programId?: string
  allocations: Allocation[]
  origin: (typeof TRANSACTION_ORIGINS)[number]
  source: AssignmentSource
  status: TransactionStatus
  /** Why auto-assign chose General funds, or what it needs from a person. */
  reason?: string
  /** When the paid-for service happens, if not the transaction date. Period checks use it. */
  serviceDate?: string
}

export type FlagKind = 'over-budget' | 'split-not-allowed'

export interface TxFlag {
  kind: FlagKind
  grantId?: string
  message: string
  /** over-budget only: how far the category is over its budget after this transaction, in dollars. */
  overBy?: number
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
  orgCategories: OrgCategory[]
  programs: Program[]
  grants: Grant[]
  transactions: Transaction[]
}
