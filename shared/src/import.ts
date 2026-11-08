import { allocationFor, toCents } from './finance.ts'
import { canReceiveTransactions } from './setup.ts'
import type { Grant, Transaction } from './types.ts'

// ─── Header mapping ─────────────────────────────────────────────────────────

export type ImportField = 'date' | 'vendor' | 'description' | 'account' | 'amount' | 'grant' | 'category'

/** Accepted headers per field, in order of preference (Grantit template + QuickBooks transaction exports). */
export const HEADER_ALIASES: Record<ImportField, string[]> = {
  date: ['date', 'transaction date'],
  vendor: ['vendor', 'name', 'payee'],
  description: ['description', 'memo', 'memo/description'],
  account: ['account', 'split'],
  amount: ['amount'],
  grant: ['grant'],
  category: ['category'],
}

const REQUIRED: ImportField[] = ['date', 'amount']

const normHeader = (h: string) => h.replace(/^﻿/, '').trim().replace(/\s+/g, ' ').toLowerCase()

export interface HeaderMap {
  /** Column index for each recognized field. */
  columns: Partial<Record<ImportField, number>>
  /** Required fields with no matching column. */
  missing: ImportField[]
  /** Headers that matched nothing and are ignored. */
  ignored: string[]
}

/** Match headers case-insensitively to fields, ignoring extra columns. The first alias present wins. */
export function mapHeaders(headers: string[]): HeaderMap {
  const norm = headers.map(normHeader)
  const columns: HeaderMap['columns'] = {}
  for (const field of Object.keys(HEADER_ALIASES) as ImportField[]) {
    for (const alias of HEADER_ALIASES[field]) {
      const i = norm.indexOf(alias)
      if (i >= 0) {
        columns[field] = i
        break
      }
    }
  }
  const used = new Set(Object.values(columns))
  return {
    columns,
    missing: REQUIRED.filter((f) => columns[f] === undefined),
    ignored: headers.filter((h, i) => !used.has(i) && h.trim()),
  }
}

// ─── Values ─────────────────────────────────────────────────────────────────

/**
 * Parse an amount like `1234.56`, `$1,234.56`, `-45`, or `(45.00)` (parentheses mean negative). Returns dollars
 * rounded to cents, or null when it isn't a number.
 */
export function parseAmount(raw: string | undefined | null): number | null {
  let s = String(raw ?? '').trim()
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1).trim()
  }
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1).trim()
  }
  s = s.replace(/^\$/, '').replace(/,/g, '').trim()
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null
  const cents = Math.round(Number(s) * 100)
  return (negative ? -cents : cents) / 100
}

/** Accept `YYYY-MM-DD` or QuickBooks' `MM/DD/YYYY`; return ISO, or null for anything else or an impossible date. */
export function parseImportDate(raw: string | undefined | null): string | null {
  const s = String(raw ?? '').trim()
  let y: number, m: number, d: number
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
  else return null
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// ─── Duplicates ─────────────────────────────────────────────────────────────

type Fingerprinted = Pick<Transaction, 'date' | 'vendor' | 'amount' | 'account' | 'description'>

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** Identity of a ledger line: date, vendor, amount (cents), account and description. */
export const fingerprint = (t: Fingerprinted) => [t.date, norm(t.vendor), toCents(t.amount), norm(t.account), norm(t.description)].join('|')

/**
 * Which incoming rows are already in the ledger. Identical rows are told apart by their occurrence index: the
 * n-th identical row in a file is a duplicate only if the ledger already holds at least n such rows. So the same
 * file imported twice adds nothing the second time, while two identical rows in one file both import the first time.
 */
export function markDuplicates(incoming: Fingerprinted[], existing: Fingerprinted[]): boolean[] {
  const have = new Map<string, number>()
  for (const t of existing) {
    const fp = fingerprint(t)
    have.set(fp, (have.get(fp) ?? 0) + 1)
  }
  const seen = new Map<string, number>()
  return incoming.map((t) => {
    const fp = fingerprint(t)
    const occurrence = seen.get(fp) ?? 0
    seen.set(fp, occurrence + 1)
    return occurrence < (have.get(fp) ?? 0)
  })
}

// ─── Whole file ─────────────────────────────────────────────────────────────

export interface ImportRow {
  tx: Omit<Transaction, 'id'>
  /** Row number in the file, counting the header as row 1. */
  line: number
  duplicate: boolean
  warning?: string
}

export interface ImportPreview {
  rows: ImportRow[]
  /** Rows that couldn't be read, with the reason. */
  errors: string[]
  missingColumns: ImportField[]
  ignoredColumns: string[]
  /** Rows that will be imported (not duplicates). */
  ready: Omit<Transaction, 'id'>[]
  duplicates: number
}

/**
 * Turn a parsed CSV (first row = headers) into transactions ready to import. Rows naming a confirmed grant and a
 * category are allocated to it; a grant that still needs setup (or doesn't exist) leaves the row unassigned
 * with a warning.
 */
export function prepareImport(table: string[][], grants: Grant[], existing: Transaction[], source: Transaction['source']): ImportPreview {
  const [headers = [], ...body] = table
  const map = mapHeaders(headers)
  const empty: ImportPreview = { rows: [], errors: [], missingColumns: map.missing, ignoredColumns: map.ignored, ready: [], duplicates: 0 }
  if (map.missing.length) return empty

  const cell = (r: string[], f: ImportField) => (map.columns[f] === undefined ? '' : (r[map.columns[f]!] ?? '').trim())
  const errors: string[] = []
  const parsed: Omit<ImportRow, 'duplicate'>[] = []

  body.forEach((r, i) => {
    const line = i + 2
    if (r.every((c) => !c.trim())) return
    const date = parseImportDate(cell(r, 'date'))
    const amount = parseAmount(cell(r, 'amount'))
    if (!date || amount === null) {
      errors.push(`Row ${line}: ${!date ? `“${cell(r, 'date')}” isn't a date (use YYYY-MM-DD or MM/DD/YYYY)` : `“${cell(r, 'amount')}” isn't an amount`}`)
      return
    }
    const grantName = cell(r, 'grant')
    const category = cell(r, 'category')
    const grant = grantName ? grants.find((g) => norm(g.name) === norm(grantName)) : undefined
    let warning: string | undefined
    let allocations: Transaction['allocations'] = []
    if (grantName && !grant) warning = `No grant named “${grantName}”; imported as unassigned`
    else if (grant && !canReceiveTransactions(grant)) warning = `${grant.name} needs setup before it can receive transactions; imported as unassigned`
    else if (grant && !category) warning = `No category given for ${grant.name}; imported as unassigned`
    else if (grant) allocations = [allocationFor(grant, category, amount)]

    parsed.push({
      line,
      warning,
      tx: { date, vendor: cell(r, 'vendor'), description: cell(r, 'description'), account: cell(r, 'account'), amount, allocations, reviewed: false, source },
    })
  })

  const dup = markDuplicates(parsed.map((p) => p.tx), existing)
  const rows = parsed.map((p, i) => ({ ...p, duplicate: dup[i] }))
  return {
    rows,
    errors,
    missingColumns: [],
    ignoredColumns: map.ignored,
    ready: rows.filter((r) => !r.duplicate).map((r) => r.tx),
    duplicates: rows.filter((r) => r.duplicate).length,
  }
}
