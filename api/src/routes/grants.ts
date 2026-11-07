import { draftAnswer, type DraftResult } from '@grantit/shared/drafting'
import { computeFinancials, grantPeriod } from '@grantit/shared/finance'
import { todayISO } from '@grantit/shared/format'
import { ANSWER_STATUSES, DEADLINE_KINDS, GRANT_STAGES, type Grant, type Question } from '@grantit/shared/types'
import { and, asc, eq, gt, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { compact, loadGrants, loadTransactions } from '../db/organization-data.ts'
import type { Db } from '../db/client.ts'
import * as t from '../db/schema.ts'
import { actorId, ApiError, decodeCursor, notFound, pageQuery, toPage, validate, type AppEnv, type Page } from '../http.ts'

// Grants (docs/api.md). The list/get pair is the reference implementation; writes nest child records
// (categories, questions, deadlines) inside the grant, matching the shared Grant type.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

const listQuery = pageQuery.extend({ stage: z.enum(GRANT_STAGES).optional() })

const categoryIn = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  budget: z.number().finite().nonnegative(),
})
const questionIn = z.object({
  id: z.string().min(1).optional(),
  prompt: z.string().min(1),
  wordLimit: z.number().int().positive(),
  answer: z.string().default(''),
  citations: z.array(z.string()).default([]),
  status: z.enum(ANSWER_STATUSES).default('empty'),
  missing: z.array(z.string()).default([]),
})
const deadlineIn = z.object({
  id: z.string().min(1).optional(),
  label: z.string().min(1),
  date: isoDate,
  kind: z.enum(DEADLINE_KINDS),
  done: z.boolean().optional(),
})

const createBody = z.object({
  name: z.string().min(1),
  funder: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  stage: z.enum(GRANT_STAGES).default('prospect'),
  cover: z.number().int().min(0).max(5).default(0),
  ownerId: z.string().min(1).optional(), // defaults to the acting user
  periodStart: isoDate,
  periodEnd: isoDate,
  rules: z.array(z.string()).default([]),
  allowSplit: z.boolean().default(false),
  categories: z.array(categoryIn).default([]),
  questions: z.array(questionIn).default([]),
  deadlines: z.array(deadlineIn).default([]),
})

// Written out rather than createBody.partial(): .partial() keeps the create-time defaults, which would
// replace sub-collections with [] on every PATCH.
const patchBody = z.object({
  name: z.string().min(1).optional(),
  funder: z.string().min(1).optional(),
  amount: z.number().finite().nonnegative().optional(),
  stage: z.enum(GRANT_STAGES).optional(),
  cover: z.number().int().min(0).max(5).optional(),
  ownerId: z.string().min(1).optional(),
  periodStart: isoDate.optional(),
  periodEnd: isoDate.optional(),
  rules: z.array(z.string()).optional(),
  allowSplit: z.boolean().optional(),
  categories: z.array(categoryIn).optional(),
  questions: z.array(questionIn).optional(),
  deadlines: z.array(deadlineIn).optional(),
})

const questionPatch = z.object({
  prompt: z.string().min(1).optional(),
  wordLimit: z.number().int().positive().optional(),
  answer: z.string().optional(),
  citations: z.array(z.string()).optional(),
  status: z.enum(ANSWER_STATUSES).optional(),
  missing: z.array(z.string()).optional(),
})

const financialsQuery = z
  .object({ start: isoDate.optional(), end: isoDate.optional() })
  .refine((q) => !q.start || !q.end || q.start <= q.end, { path: ['start'], message: 'Start must be on or before end' })

const toQuestion = ({ grantId: _g, position: _p, ...row }: typeof t.questions.$inferSelect): Question => compact(row)

/** Map Postgres unique violations (23505, on the error or its cause) onto the API's 409 conflict. */
const conflictOn = (err: unknown, message: string): never => {
  const code = (e: unknown) => (typeof e === 'object' && e !== null ? (e as { code?: string }).code : undefined)
  if (code(err) === '23505' || code((err as { cause?: unknown }).cause) === '23505') throw new ApiError('conflict', message)
  throw err
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** Insert a grant's child rows; ids default to c1/q1/d1… within the grant, like the demo data. */
async function insertChildren(tx: Tx, grantId: string, input: Pick<z.output<typeof createBody>, 'categories' | 'questions' | 'deadlines'>) {
  if (input.categories.length)
    await tx.insert(t.budgetCategories).values(input.categories.map((c, i) => ({ ...c, id: c.id ?? `c${i + 1}`, grantId, position: i })))
  if (input.questions.length)
    await tx.insert(t.questions).values(input.questions.map((q, i) => ({ ...q, id: q.id ?? `q${i + 1}`, grantId, position: i })))
  if (input.deadlines.length)
    await tx.insert(t.deadlines).values(input.deadlines.map((d, i) => ({ ...d, id: d.id ?? `d${i + 1}`, grantId, position: i })))
}

export const grantRoutes = new Hono<AppEnv>()
  /** GET /api/grants?stage=&limit=&cursor= → { data: Grant[], nextCursor } ordered by id. */
  .get('/', validate('query', listQuery), async (c) => {
    const { limit, cursor, stage } = c.req.valid('query')
    const db = c.get('db')
    const where: SQL[] = [eq(t.grants.organizationId, c.get('organizationId'))]
    if (stage) where.push(eq(t.grants.stage, stage))
    if (cursor) where.push(gt(t.grants.id, decodeCursor(cursor)))

    const ids = await db
      .select({ id: t.grants.id })
      .from(t.grants)
      .where(and(...where))
      .orderBy(asc(t.grants.id))
      .limit(limit + 1)
    const page = toPage(ids, limit, (r) => r.id)
    const loaded = await loadGrants(db, c.get('organizationId'), page.data.map((r) => r.id))
    const byId = new Map(loaded.map((g) => [g.id, g]))
    const body: Page<Grant> = { data: page.data.map((r) => byId.get(r.id)!), nextCursor: page.nextCursor }
    return c.json(body)
  })
  /** POST /api/grants → 201 { data: Grant } with any categories, questions and deadlines created. */
  .post('/', validate('json', createBody), async (c) => {
    const input = c.req.valid('json')
    const { categories: _c, questions: _q, deadlines: _d, ownerId: _o, ...fields } = input
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const ownerId = input.ownerId ?? (await actorId(c))
    const owner = await db.query.users.findFirst({ where: and(eq(t.users.id, ownerId), eq(t.users.organizationId, organizationId)), columns: { id: true } })
    if (!owner) throw new ApiError('validation_failed', 'Invalid request body', [{ path: 'ownerId', message: 'No such user in this organization' }])

    const grantId = crypto.randomUUID()
    try {
      await db.transaction(async (tx) => {
        await tx.insert(t.grants).values({ ...fields, id: grantId, organizationId, ownerId })
        await insertChildren(tx, grantId, input)
      })
    } catch (err) {
      conflictOn(err, 'Duplicate id or category name in the grant')
    }
    const [grant] = await loadGrants(db, organizationId, [grantId])
    return c.json({ data: grant }, 201)
  })
  /**
   * PATCH /api/grants/:grantId → { data: Grant }. Omitted fields are unchanged; a provided
   * categories/questions/deadlines array replaces that whole sub-collection.
   */
  .patch('/:grantId', validate('json', patchBody), async (c) => {
    const grantId = c.req.param('grantId')
    const { categories, questions, deadlines, ...fields } = c.req.valid('json')
    const db = c.get('db')
    const organizationId = c.get('organizationId')

    const [existing] = await db.select({ id: t.grants.id }).from(t.grants).where(and(eq(t.grants.id, grantId), eq(t.grants.organizationId, organizationId)))
    if (!existing) throw notFound('Grant', grantId)
    if (fields.ownerId) {
      const owner = await db.query.users.findFirst({ where: and(eq(t.users.id, fields.ownerId), eq(t.users.organizationId, organizationId)), columns: { id: true } })
      if (!owner) throw new ApiError('validation_failed', 'Invalid request body', [{ path: 'ownerId', message: 'No such user in this organization' }])
    }

    try {
      await db.transaction(async (tx) => {
        if (Object.keys(fields).length) await tx.update(t.grants).set(fields).where(eq(t.grants.id, grantId))
        const provided = { categories, questions, deadlines }
        const replace = async (table: typeof t.budgetCategories | typeof t.questions | typeof t.deadlines, key: keyof typeof provided) => {
          if (!provided[key]) return
          await tx.delete(table).where(eq(table.grantId, grantId))
        }
        await replace(t.budgetCategories, 'categories')
        await replace(t.questions, 'questions')
        await replace(t.deadlines, 'deadlines')
        await insertChildren(tx, grantId, {
          categories: categories ?? [],
          questions: questions ?? [],
          deadlines: deadlines ?? [],
        })
      })
    } catch (err) {
      conflictOn(err, 'Duplicate id or category name in the grant')
    }
    const [grant] = await loadGrants(db, organizationId, [grantId])
    return c.json({ data: grant })
  })
  /** GET /api/grants/:grantId → { data: Grant } with categories, questions and deadlines. */
  .get('/:grantId', async (c) => {
    const grantId = c.req.param('grantId')
    const [grant] = await loadGrants(c.get('db'), c.get('organizationId'), [grantId])
    if (!grant) throw notFound('Grant', grantId)
    return c.json({ data: grant })
  })
  /**
   * GET /api/grants/:grantId/financials?start=&end= → { data: GrantFinancials } for the funder's period,
   * or the given YYYY-MM-DD range. Computed by shared computeFinancials, never stored.
   */
  .get('/:grantId/financials', validate('query', financialsQuery), async (c) => {
    const grantId = c.req.param('grantId')
    const { start, end } = c.req.valid('query')
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const [grant] = await loadGrants(db, organizationId, [grantId])
    if (!grant) throw notFound('Grant', grantId)
    const txs = await loadTransactions(db, organizationId)
    const period = start || end ? { start: start ?? grant.periodStart, end: end ?? grant.periodEnd } : grantPeriod(grant)
    return c.json({ data: computeFinancials(grant, txs, period) })
  })
  /** PATCH /api/grants/:grantId/questions/:questionId → { data: Question }; stamps updatedAt. */
  .patch('/:grantId/questions/:questionId', validate('json', questionPatch), async (c) => {
    const { grantId, questionId } = c.req.param()
    const db = c.get('db')
    const [grant] = await db
      .select({ id: t.grants.id })
      .from(t.grants)
      .where(and(eq(t.grants.id, grantId), eq(t.grants.organizationId, c.get('organizationId'))))
    if (!grant) throw notFound('Grant', grantId)

    const [row] = await db
      .update(t.questions)
      .set({ ...c.req.valid('json'), updatedAt: todayISO() })
      .where(and(eq(t.questions.grantId, grantId), eq(t.questions.id, questionId)))
      .returning()
    if (!row) throw notFound('Question', questionId)
    return c.json({ data: toQuestion(row) })
  })
  /**
   * POST /api/grants/:grantId/questions/:questionId/drafts → 201 { data: { question, draft } }.
   * Drafts the answer from the organization's approved facts (shared draftAnswer behind the DraftResult
   * contract) and saves it on the question.
   */
  .post('/:grantId/questions/:questionId/drafts', async (c) => {
    const { grantId, questionId } = c.req.param()
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const [grant] = await db
      .select({ id: t.grants.id })
      .from(t.grants)
      .where(and(eq(t.grants.id, grantId), eq(t.grants.organizationId, organizationId)))
    if (!grant) throw notFound('Grant', grantId)

    const question = await db.query.questions.findFirst({ where: and(eq(t.questions.grantId, grantId), eq(t.questions.id, questionId)) })
    if (!question) throw notFound('Question', questionId)
    const factRows = await db.select().from(t.facts).where(eq(t.facts.organizationId, organizationId))
    const draft = draftAnswer(question, factRows.map(compact))

    const [row] = await db
      .update(t.questions)
      .set({ answer: draft.text, citations: draft.citations, missing: draft.missing, status: 'draft', updatedAt: todayISO() })
      .where(and(eq(t.questions.grantId, grantId), eq(t.questions.id, questionId)))
      .returning()
    return c.json({ data: { question: toQuestion(row), draft: draft satisfies DraftResult } }, 201)
  })
