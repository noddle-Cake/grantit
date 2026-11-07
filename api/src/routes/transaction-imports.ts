import type { Transaction } from '@grantit/shared/types'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import Papa from 'papaparse'
import { z } from 'zod'
import { loadTransactions } from '../db/organization-data.ts'
import { allocations, grants, transactions } from '../db/schema.ts'
import { validate, type AppEnv } from '../http.ts'

// Server-side CSV transaction import (docs/api.md). Same column rules as the web import modal:
// date, vendor, description, account, amount, and optional grant (matched by name) + category.

const importBody = z.object({ csv: z.string().min(1) })

interface ParsedRow {
  transaction: typeof transactions.$inferInsert
  allocation?: typeof allocations.$inferInsert
}

export const transactionImportRoutes = new Hono<AppEnv>()
  /**
   * POST /api/transaction-imports → 201 { data: Transaction[], errors: string[] }.
   * Body: { csv }. Rows missing a YYYY-MM-DD date or a numeric amount are skipped and reported in
   * `errors` as `Row N: …` (N is the CSV line number, header = row 1).
   */
  .post('/', validate('json', importBody), async (c) => {
    const { csv } = c.req.valid('json')
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const grantRows = await db.select({ id: grants.id, name: grants.name }).from(grants).where(eq(grants.organizationId, organizationId))
    const grantByName = new Map(grantRows.map((g) => [g.name.toLowerCase(), g.id]))

    const parsed = Papa.parse<Record<string, string>>(csv.trim(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    })

    const errors: string[] = []
    const rows: ParsedRow[] = []
    parsed.data.forEach((r, i) => {
      const amount = Number(String(r.amount ?? '').replace(/[$,]/g, ''))
      const date = (r.date ?? '').trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount)) {
        errors.push(`Row ${i + 2}: needs date (YYYY-MM-DD) and numeric amount`)
        return
      }
      const id = crypto.randomUUID()
      const grantId = grantByName.get((r.grant ?? '').trim().toLowerCase())
      const category = (r.category ?? '').trim()
      rows.push({
        transaction: {
          id,
          organizationId,
          date,
          vendor: (r.vendor ?? '').trim(),
          description: (r.description ?? r.memo ?? '').trim(),
          account: (r.account ?? '').trim(),
          amount,
          reviewed: false,
          source: 'csv',
        },
        allocation: grantId && category ? { transactionId: id, position: 0, grantId, category, amount } : undefined,
      })
    })

    await db.transaction(async (tx) => {
      if (rows.length) await tx.insert(transactions).values(rows.map((r) => r.transaction))
      const allocs = rows.flatMap((r) => (r.allocation ? [r.allocation] : []))
      if (allocs.length) await tx.insert(allocations).values(allocs)
    })

    const loaded = await loadTransactions(db, organizationId, rows.map((r) => r.transaction.id))
    const byId = new Map(loaded.map((txn) => [txn.id, txn]))
    const created: Transaction[] = rows.map((r) => byId.get(r.transaction.id)!)
    return c.json({ data: created, errors }, 201)
  })
