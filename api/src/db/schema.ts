import {
  ANSWER_STATUSES,
  DEADLINE_KINDS,
  DOCUMENT_KINDS,
  DOCUMENT_OUTCOMES,
  FACT_CATEGORIES,
  FACT_STATUSES,
  GRANT_STAGES,
  ROLES,
  TRANSACTION_SOURCES,
} from '@grantit/shared/types'
import { sql } from 'drizzle-orm'
import { boolean, check, date, index, integer, numeric, pgEnum, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core'

// Database schema for the domain model in shared/src/types.ts.
//
// - Column names are snake_case (drizzle `casing: 'snake_case'`); TypeScript keys match the shared types.
// - Top-level records (users, facts, documents, grants, transactions) carry organization_id. Child rows
//   (budget categories, questions, deadlines, allocations) belong to a grant or transaction and are scoped
//   through it. Deleting an organization deletes everything it owns.
// - IDs are text so the demo data keeps its readable IDs; the API generates UUIDs for new records.
//   Categories, questions and deadlines are identified within their grant (the demo reuses `c1`, `q1`
//   across grants), so their primary key is (grant_id, id).
// - Money is numeric(12,2), read and written as JS numbers in dollars (docs/api.md).
// - Calendar dates are Postgres `date`, exchanged as YYYY-MM-DD strings.

const money = () => numeric({ precision: 12, scale: 2, mode: 'number' })
const isoDate = () => date({ mode: 'string' })
const textArray = () => text().array().notNull().default(sql`'{}'::text[]`)
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()

export const roleEnum = pgEnum('role', ROLES)
export const factCategoryEnum = pgEnum('fact_category', FACT_CATEGORIES)
export const factStatusEnum = pgEnum('fact_status', FACT_STATUSES)
export const documentKindEnum = pgEnum('document_kind', DOCUMENT_KINDS)
export const documentOutcomeEnum = pgEnum('document_outcome', DOCUMENT_OUTCOMES)
export const grantStageEnum = pgEnum('grant_stage', GRANT_STAGES)
export const answerStatusEnum = pgEnum('answer_status', ANSWER_STATUSES)
export const deadlineKindEnum = pgEnum('deadline_kind', DEADLINE_KINDS)
export const transactionSourceEnum = pgEnum('transaction_source', TRANSACTION_SOURCES)

export const organizations = pgTable(
  'organizations',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    ein: text().notNull(),
    fiscalYearStartMonth: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [check('fiscal_year_start_month_range', sql`${t.fiscalYearStartMonth} between 1 and 12`)],
)

const organizationId = () =>
  text()
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' })

export const users = pgTable(
  'users',
  {
    id: text().primaryKey(),
    organizationId: organizationId(),
    name: text().notNull(),
    role: roleEnum().notNull(),
    title: text().notNull(),
    initials: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.organizationId)],
)

// Bearer-token sessions until real credentials exist: POST /auth/sign-in { userId } issues one.
export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(), // the bearer token itself
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
)

export const facts = pgTable(
  'facts',
  {
    id: text().primaryKey(),
    organizationId: organizationId(),
    category: factCategoryEnum().notNull(),
    title: text().notNull(),
    content: text().notNull(),
    tags: textArray(),
    status: factStatusEnum().notNull(),
    source: text(),
    updatedAt: isoDate().notNull(),
    updatedBy: text()
      .notNull()
      .references(() => users.id),
    approvedBy: text().references(() => users.id),
    approvedAt: isoDate(),
  },
  (t) => [
    index().on(t.organizationId, t.status),
    check('approval_complete', sql`(${t.approvedBy} is null) = (${t.approvedAt} is null)`),
  ],
)

export const documents = pgTable(
  'documents',
  {
    id: text().primaryKey(),
    organizationId: organizationId(),
    name: text().notNull(),
    kind: documentKindEnum().notNull(),
    funder: text().notNull(),
    year: integer().notNull(),
    outcome: documentOutcomeEnum(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.organizationId)],
)

export const grants = pgTable(
  'grants',
  {
    id: text().primaryKey(),
    organizationId: organizationId(),
    name: text().notNull(),
    funder: text().notNull(),
    amount: money().notNull(),
    stage: grantStageEnum().notNull(),
    cover: integer().notNull().default(0),
    ownerId: text()
      .notNull()
      .references(() => users.id),
    periodStart: isoDate().notNull(),
    periodEnd: isoDate().notNull(),
    rules: textArray(),
    allowSplit: boolean().notNull().default(false),
    // Null until the award's budget and period are confirmed (awarded/reporting grants then "need setup").
    setupConfirmedAt: isoDate(),
    // Null means the funder's year starts in the month the grant period starts.
    funderFiscalYearStartMonth: integer(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.organizationId),
    check('period_order', sql`${t.periodEnd} >= ${t.periodStart}`),
    check('funder_fiscal_year_start_month_range', sql`${t.funderFiscalYearStartMonth} between 1 and 12`),
  ],
)

const grantId = () =>
  text()
    .notNull()
    .references(() => grants.id, { onDelete: 'cascade' })

export const budgetCategories = pgTable(
  'budget_categories',
  {
    id: text().notNull(),
    grantId: grantId(),
    position: integer().notNull(),
    name: text().notNull(),
    budget: money().notNull(),
  },
  // Allocations refer to categories by id; names stay unique within a grant so CSV imports match one category.
  (t) => [primaryKey({ columns: [t.grantId, t.id] }), unique().on(t.grantId, t.name), index().on(t.grantId, t.position)],
)

export const questions = pgTable(
  'questions',
  {
    id: text().notNull(),
    grantId: grantId(),
    position: integer().notNull(),
    prompt: text().notNull(),
    wordLimit: integer().notNull(),
    answer: text().notNull().default(''),
    citations: textArray(), // fact ids
    status: answerStatusEnum().notNull().default('empty'),
    missing: textArray(),
    updatedAt: isoDate(),
  },
  (t) => [primaryKey({ columns: [t.grantId, t.id] }), index().on(t.grantId, t.position), check('word_limit_positive', sql`${t.wordLimit} > 0`)],
)

export const deadlines = pgTable(
  'deadlines',
  {
    id: text().notNull(),
    grantId: grantId(),
    position: integer().notNull(),
    label: text().notNull(),
    date: isoDate().notNull(),
    kind: deadlineKindEnum().notNull(),
    done: boolean(),
  },
  (t) => [primaryKey({ columns: [t.grantId, t.id] }), index().on(t.grantId, t.position)],
)

export const transactions = pgTable(
  'transactions',
  {
    id: text().primaryKey(),
    organizationId: organizationId(),
    date: isoDate().notNull(),
    vendor: text().notNull(),
    description: text().notNull(),
    account: text().notNull(),
    amount: money().notNull(),
    reviewed: boolean().notNull().default(false),
    source: transactionSourceEnum().notNull(),
    // True when deliberately paid from unrestricted funds; null otherwise (matches the optional shared field).
    notGrantFunded: boolean(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.organizationId, t.date)],
)

// Expenditure audit trail (P2): who changed what on transactions and allocations.
export const AUDIT_ACTIONS = ['transaction.created', 'transaction.updated', 'allocations.replaced', 'transactions.imported'] as const
export const auditActionEnum = pgEnum('audit_action', AUDIT_ACTIONS)

export const auditEvents = pgTable(
  'audit_events',
  {
    id: text().primaryKey(),
    organizationId: organizationId(),
    transactionId: text()
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    action: auditActionEnum().notNull(),
    actorId: text().references(() => users.id),
    detail: text().notNull().default(''), // e.g. the fields changed or rows imported
    createdAt: createdAt(),
  },
  (t) => [index().on(t.organizationId, t.transactionId)],
)

export const allocations = pgTable(
  'allocations',
  {
    transactionId: text()
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    grantId: grantId(),
    // The grant's budget category (ids are unique within a grant). Not a foreign key, so deleting or
    // renaming categories never cascades into the ledger; the shared rules flag an id the grant lacks.
    categoryId: text(),
    // A category name the grant doesn't have, kept as imported: exactly what the "unauthorized category" flag
    // reports. Stored in the original `category` column.
    unmatchedCategory: text('category'),
    amount: money().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.position] }),
    index().on(t.grantId),
    check('category_or_unmatched', sql`(${t.categoryId} is null) <> (${t.unmatchedCategory} is null)`),
  ],
)
