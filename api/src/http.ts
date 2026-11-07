import type { Context, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { validator } from 'hono/validator'
import { z } from 'zod'
import type { Db } from './db/client.ts'

// Shared HTTP plumbing for every route, implementing docs/api.md.

// ─── Errors ─────────────────────────────────────────────────────────────────

export const ERROR_STATUS = {
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  internal: 500,
} as const satisfies Record<string, ContentfulStatusCode>

export type ErrorCode = keyof typeof ERROR_STATUS

export interface ErrorDetail {
  path: string
  message: string
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: ErrorDetail[] }
}

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly details?: ErrorDetail[]
  constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message)
    this.code = code
    this.details = details
  }
}

export const notFound = (what: string, id: string) => new ApiError('not_found', `${what} ${id} not found`)

export function errorResponse(c: Context, code: ErrorCode, message: string, details?: ErrorDetail[]) {
  const body: ErrorBody = { error: { code, message, ...(details ? { details } : {}) } }
  return c.json(body, ERROR_STATUS[code])
}

/** app.onError: ApiError → its code; anything else → 500 without leaking internals. */
export function handleError(err: Error, c: Context) {
  if (err instanceof ApiError) return errorResponse(c, err.code, err.message, err.details)
  if (err instanceof HTTPException && err.status < 500) {
    const code = (Object.entries(ERROR_STATUS).find(([, s]) => s === err.status)?.[0] ?? 'validation_failed') as ErrorCode
    return errorResponse(c, code, err.message || 'Bad request')
  }
  console.error(err)
  return errorResponse(c, 'internal', 'Something went wrong')
}

// ─── Validation ─────────────────────────────────────────────────────────────

const toDetails = (issues: z.core.$ZodIssue[]): ErrorDetail[] =>
  issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }))

/** Validate `json`, `query` or `param` input with a Zod schema; failures become 400 validation_failed. */
export const validate = <T extends z.ZodType>(target: 'json' | 'query' | 'param', schema: T) =>
  validator(target, (value) => {
    const parsed = schema.safeParse(value)
    if (!parsed.success) throw new ApiError('validation_failed', `Invalid ${target === 'json' ? 'request body' : target}`, toDetails(parsed.error.issues))
    return parsed.data as z.output<T>
  })

// ─── Pagination ─────────────────────────────────────────────────────────────

export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
})

export interface Page<T> {
  data: T[]
  nextCursor: string | null
}

/** Cursors are opaque to clients: base64url of the last row's sort key. */
export const encodeCursor = (key: string) => Buffer.from(key, 'utf8').toString('base64url')
export function decodeCursor(cursor: string): string {
  const key = Buffer.from(cursor, 'base64url').toString('utf8')
  if (!key) throw new ApiError('validation_failed', 'Invalid cursor', [{ path: 'cursor', message: 'Not a cursor from this API' }])
  return key
}

/** Given up to limit+1 rows, return one page and the cursor for the next. */
export function toPage<T>(rows: T[], limit: number, key: (row: T) => string): Page<T> {
  const data = rows.slice(0, limit)
  return { data, nextCursor: rows.length > limit ? encodeCursor(key(data[data.length - 1])) : null }
}

// ─── Organization scoping ───────────────────────────────────────────────────

export interface AppEnv {
  Variables: { db: Db; organizationId: string }
}

/**
 * Resolves the organization every request acts for. Until sign-in exists (#9) it comes from the
 * X-Organization-Id header, falling back to DEFAULT_ORGANIZATION_ID. Sign-in will replace this middleware
 * and take the organization from the session; routes don't change.
 */
export function organizationScope(opts: { defaultOrganizationId?: string; exists: (id: string) => Promise<boolean> }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const id = c.req.header('x-organization-id') ?? opts.defaultOrganizationId
    if (!id) throw new ApiError('unauthenticated', 'No organization: send X-Organization-Id')
    if (!(await opts.exists(id))) throw notFound('Organization', id)
    c.set('organizationId', id)
    await next()
  }
}
