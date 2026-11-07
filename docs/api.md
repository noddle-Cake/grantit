# API conventions

Every Grantit endpoint follows these rules, so the AI application workflow (Chris) and financial tracking
(Sam) can be built in parallel in Phase 2 and still fit together in Phase 3. The grants endpoints in
[`api/src/routes/grants.ts`](../api/src/routes/grants.ts) are the reference implementation, and
[`api/src/http.ts`](../api/src/http.ts) has the shared helpers. Stack decision:
[ADR 0001](adr/0001-backend.md).

## Basics

- **Base path:** `/api`. In production nginx serves the web app and API from one origin. In development,
  Vite proxies `/api` to the API on port 8787.
- **No version prefix.** The web app and API ship together from one repo, so a breaking change updates both in
  one PR. Additive changes (new fields, new endpoints) are always fine.
- **JSON only**, UTF-8, with `Content-Type: application/json` on every request that has a body.
- **Field names are camelCase and match `shared/src/types.ts`.** A `Grant` from the API is the same object the
  web app already uses, so responses are typed with the shared types rather than new DTOs.

## Resources and URLs

- Plural nouns, kebab-case: `/grants`, `/facts`, `/transactions`.
- A record that only exists inside a grant is nested under it: `/grants/:grantId/questions/:questionId`.
  Category, question and deadline IDs are only unique within their grant.
- Actions that aren't plain CRUD are sub-resources named after the noun they create:
  `POST /grants/:grantId/questions/:questionId/drafts`, not `/draftAnswer`.
- Path parameters are named `<resource>Id` (`grantId`, `factId`).

## Methods and status codes

| Method | Use | Success |
|---|---|---|
| `GET` | Read one record or a list | `200` |
| `POST` | Create a record, or run an action that creates something | `201` with the created record |
| `PATCH` | Change some fields; omitted fields stay as they are | `200` with the whole updated record |
| `PUT` | Replace a whole sub-collection, such as a transaction's allocations | `200` |
| `DELETE` | Remove a record | `204`, no body |

## Response shape

One record:

```json
{ "data": { "id": "g-wellness", "name": "Youth Mental Health Partnership", "…": "…" } }
```

A list:

```json
{ "data": [ { "id": "g-anchor" }, { "id": "g-camp" } ], "nextCursor": "Zy1jYW1w" }
```

Computed values that come from the shared rules (spending per category, compliance flags, word counts) are
returned alongside the record, never stored. For example, `GET /grants/:grantId/financials` will return
`computeFinancials()` output for the grant's funding period.

## Errors

Every error has the same shape and an HTTP status that matches its `code`:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Invalid query",
    "details": [{ "path": "limit", "message": "Too small: expected number to be >=1" }]
  }
}
```

| `code` | Status | When |
|---|---|---|
| `validation_failed` | 400 | Body, query or path parameters fail validation. `details` lists each problem by field path. |
| `unauthenticated` | 401 | No organization or session (after sign-in, #9) |
| `forbidden` | 403 | The user's role can't do this (`shared/src/permissions.ts`, enforced in #11) |
| `not_found` | 404 | No such route, or no such record **in this organization** |
| `conflict` | 409 | Uniqueness or state conflicts, e.g. a duplicate category name in a grant |
| `internal` | 500 | Anything unexpected. The message is generic, and details go to the server log only. |

Throw `ApiError` (or `notFound(what, id)`) from a handler; `app.onError` turns it into this shape.

## Validation

- Validate every input with a Zod schema through `validate('json' | 'query' | 'param', schema)` from
  `api/src/http.ts`. Handlers read the parsed value with `c.req.valid(...)` and never touch raw input.
- Build enum fields from the const arrays in `shared/src/types.ts` (`z.enum(GRANT_STAGES)`) so the database,
  validation and UI accept the same values.
- Business rules such as word limits, allowed categories and split allocations come from `@grantit/shared`,
  so the server enforces exactly what the UI shows.

## Data formats

| Kind | Format | Example |
|---|---|---|
| IDs | Strings. The server generates `crypto.randomUUID()` for new records; demo data keeps readable IDs. Clients never invent IDs for records the server stores. | `"g-wellness"` |
| Calendar dates (deadlines, funding periods, transaction dates) | `YYYY-MM-DD` with no time zone | `"2026-06-30"` |
| Timestamps | ISO 8601 in UTC | `"2026-11-07T22:31:04Z"` |
| Money | Dollars as a JSON number with at most 2 decimals, stored as `numeric(12,2)` | `42000`, `1499.95` |
| Lists of strings (tags, rules, citations) | JSON arrays, never comma-separated strings | `["stem", "after-school"]` |

## Pagination and filtering

- List endpoints take `limit` (default 50, max 200) and `cursor`. The response's `nextCursor` is `null` on the
  last page. Cursors are opaque: pass them back unchanged.
- Each list has a fixed order, stated in its route comment (grants are ordered by `id`).
- Filters are query parameters named after the field: `/grants?stage=awarded`,
  `/transactions?grantId=g-anchor&reviewed=false`.

## Organizations and (later) auth

- Every request acts for one organization, and handlers read it from `c.get('organizationId')`. Every query
  is filtered by it. The organization ID is never taken from a request body.
- Until sign-in exists (#9), the organization comes from the `X-Organization-Id` header, falling back to
  `DEFAULT_ORGANIZATION_ID` (the demo organization in local development). Sign-in will replace the
  `organizationScope` middleware and take the organization from the session, with no route changes.
- Another organization's record returns `404`, not `403`, so the API never confirms it exists.

## Tests

- Each route file has a `*.test.ts` next to it that calls `createApp({ db }).request(...)` against the test
  database (`TEST_DATABASE_URL`). It loads data with `replaceOrganization` and starts from `clearData`.
- Cover the success response, at least one validation failure, `404` for a missing record, and organization
  isolation.

## Endpoints

| Endpoint | Status | Issue |
|---|---|---|
| `GET /grants`, `GET /grants/:grantId` | done (reference) | #78 |
| `PATCH /grants/:grantId`, `POST /grants` | done | #4 |
| `GET/POST /facts`, `PATCH/DELETE /facts/:factId` | done | #4 |
| `PATCH /grants/:grantId/questions/:questionId` | done | #4 |
| `POST /grants/:grantId/questions/:questionId/drafts` | done | #14 |
| `GET/POST /transactions`, `PATCH /transactions/:transactionId` | done | #79 |
| `PUT /transactions/:transactionId/allocations` | done | #79 |
| `GET /grants/:grantId/financials?start=&end=` | done | #79 |
| `POST /transaction-imports` (CSV) | done | #6 |
| `GET/PATCH /organization` | done | #80 |
| `GET /users`, `GET /documents` | done | #80 |
| `GET /opportunities`, `POST /opportunities/:opportunityId/grants` | done | #8 |

Notes on the built endpoints:

- `PATCH /grants/:grantId` patches scalar fields; a provided `categories`, `questions` or `deadlines` array
  replaces that whole sub-collection. Child ids default to `c1`, `q1`, `d1`… within the grant.
- `POST …/drafts` returns `201` with `{ data: { question, draft } }`: the saved question plus the
  `DraftResult` (text, citations, missing, blockedBy) from the shared `draftAnswer` engine.
- `POST /transaction-imports` takes `{ csv }` (same columns as the web import) and returns `201` with
  `{ data: Transaction[], errors: string[] }` — invalid rows are skipped and reported as `Row N: …`.
- Until sign-in exists (#9), writes that need a user (fact `updatedBy`/`approvedBy`, a new grant's
  `ownerId`) take `X-User-Id`, falling back to the organization's first user.
