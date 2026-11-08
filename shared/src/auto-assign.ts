// Category-first coding: fill in each expense's category and program, then suggest which grant budget lines pay for
// it, spending the money that expires soonest first. Pure functions over the ledger; nothing here reads the clock.

import { computeFinancials, effectiveDate, fromCents, grantPeriod, inPeriod, toCents } from './finance.ts'
import { finalReport } from './funds.ts'
import { canReceiveTransactions } from './setup.ts'
import type { Allocation, BudgetCategory, Grant, OrgCategory, Program, Transaction, TransactionStatus } from './types.ts'
import { FUNDED_STAGES } from './workspaces.ts'

export interface Books {
  grants: Grant[]
  orgCategories: OrgCategory[]
  programs: Program[]
  transactions: Transaction[]
}

/** Shared costs. Never paid by a grant. */
export const ADMIN_PROGRAM_ID = 'p-admin'

const INDIRECT_GL = '7900'
const PICK_CATEGORY = 'Pick a category'
export const PICK_PROGRAM = 'Pick a program'

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
const glCode = (account: string) => norm(account).split(' ')[0]
const generalFunds = (amount: number): Allocation => ({ grantId: null, amount })

// ─── Category and program ───────────────────────────────────────────────────

export const categoryForAccount = (categories: OrgCategory[], account: string) => categories.find((c) => c.glAccounts.includes(glCode(account)))?.id

/** Confirmed charges to the same payee, most recent first. */
function payeeHistory(tx: Transaction, txs: Transaction[]) {
  return txs
    .filter((t) => t.id !== tx.id && t.status === 'done' && norm(t.vendor) === norm(tx.vendor))
    .sort((a, b) => effectiveDate(b).localeCompare(effectiveDate(a)))
}

/**
 * Fill in what's blank. Category: the GL mapping, then the payee's last category. Program (when no QuickBooks class
 * set it): the most recent confirmed charge to the same payee in the same category. Otherwise it stays blank.
 */
export function codeTransaction(tx: Transaction, books: Books): Transaction {
  const history = payeeHistory(tx, books.transactions)
  const categoryId = tx.categoryId ?? categoryForAccount(books.orgCategories, tx.account) ?? history.find((t) => t.categoryId)?.categoryId
  const programId = tx.programId ?? history.find((t) => t.categoryId === categoryId && t.programId)?.programId
  return { ...tx, ...(categoryId ? { categoryId } : {}), ...(programId ? { programId } : {}) }
}

// ─── Eligible lines ─────────────────────────────────────────────────────────

export interface EligibleLine {
  grant: Grant
  line: BudgetCategory
  /** Left on the line, not counting this transaction's own charges. */
  remaining: number
}

const lower = (s: string | undefined) => (s ?? '').toLowerCase()

/** A report due on or after the period's end is the closing one; an earlier "last" report is only the latest so far. */
function finalReportSubmitted(g: Grant) {
  const report = finalReport(g)
  return !!report?.done && report.date >= g.periodEnd
}

/**
 * The budget lines that can pay for this transaction, by soonest-ending grant (then most remaining), or the reason
 * none can. Both the suggestion and the dropdowns use this.
 */
export function eligibleLines(tx: Transaction, books: Books): { lines: EligibleLine[]; reason?: string } {
  const program = lower(books.programs.find((p) => p.id === tx.programId)?.name)
  const category = lower(books.orgCategories.find((c) => c.id === tx.categoryId)?.name)
  if (!tx.programId || !tx.categoryId) return { lines: [] }

  const funded = books.grants.filter((g) => g.programId === tx.programId && tx.programId !== ADMIN_PROGRAM_ID && (FUNDED_STAGES as readonly string[]).includes(g.stage))
  if (!funded.length) return { lines: [], reason: `No grant funds ${program}` }

  const covering = funded.filter((g) => inPeriod(effectiveDate(tx), grantPeriod(g)))
  if (!covering.length) return { lines: [], reason: `Outside every ${program} grant's period` }

  const open = covering.filter((g) => canReceiveTransactions(g) && !finalReportSubmitted(g))
  if (!open.length) {
    const noBudget = covering.find((g) => !canReceiveTransactions(g) && g.stage !== 'closed')
    return { lines: [], reason: noBudget ? `${noBudget.name} has no budget yet` : `${covering[0].name}'s final report is submitted` }
  }

  const others = books.transactions.filter((t) => t.id !== tx.id)
  const accepting = open.flatMap((grant) => {
    const f = computeFinancials(grant, others)
    return grant.categories
      .filter((line) => line.acceptedCategoryIds?.includes(tx.categoryId!))
      .map((line) => ({ grant, line, remaining: f.categories.find((c) => c.id === line.id)!.remaining }))
  })
  if (!accepting.length) return { lines: [], reason: `No ${program} grant allows ${category}` }

  const lines = accepting
    .filter((l) => l.remaining > 0)
    .sort((a, b) => a.grant.periodEnd.localeCompare(b.grant.periodEnd) || b.remaining - a.remaining)
  return lines.length ? { lines } : { lines: [], reason: `No ${category} money left on any ${program} grant` }
}

// ─── Suggestion ─────────────────────────────────────────────────────────────

export interface Suggestion {
  allocations: Allocation[]
  status: Exclude<TransactionStatus, 'done'>
  reason?: string
}

const ask = (reason: string): Suggestion => ({ allocations: [], status: 'needs_input', reason })

/**
 * When several lines of one grant accept the category, keep the line this payee was last charged to. Returns the
 * grant to ask about when its history doesn't settle it.
 */
function oneLinePerGrant(tx: Transaction, lines: EligibleLine[], books: Books): { lines: EligibleLine[]; ambiguous?: Grant } {
  const history = payeeHistory(tx, books.transactions)
  const kept: EligibleLine[] = []
  for (const l of lines) {
    const rivals = lines.filter((x) => x.grant.id === l.grant.id)
    if (rivals.length === 1) {
      kept.push(l)
      continue
    }
    const lastLine = history.flatMap((t) => t.allocations).find((a) => a.grantId === l.grant.id && rivals.some((r) => r.line.id === a.budgetLineId))?.budgetLineId
    if (!lastLine) return { lines: [], ambiguous: l.grant }
    if (l.line.id === lastLine) kept.push(l)
  }
  return { lines: kept }
}

/** Fill the lines in order; whatever doesn't fit goes to General funds. */
function fillGreedily(amount: number, lines: EligibleLine[]): Allocation[] {
  let left = toCents(amount)
  const allocations: Allocation[] = []
  for (const { grant, line, remaining } of lines) {
    if (!left) break
    const take = Math.min(left, toCents(remaining))
    allocations.push({ grantId: grant.id, budgetLineId: line.id, amount: fromCents(take) })
    left -= take
  }
  return left ? [...allocations, generalFunds(fromCents(left))] : allocations
}

/** A refund repeats the most recent matching purchase: same payee and category, its grants still covering this date. */
function suggestRefund(tx: Transaction, books: Books): Suggestion {
  const date = effectiveDate(tx)
  const stillCovered = (a: Allocation) => {
    if (a.grantId === null) return true
    const grant = books.grants.find((g) => g.id === a.grantId)
    return !!grant && inPeriod(date, grantPeriod(grant))
  }
  const original = books.transactions
    .filter((t) => t.id !== tx.id && t.amount > 0 && t.allocations.length && t.categoryId === tx.categoryId && norm(t.vendor) === norm(tx.vendor) && effectiveDate(t) <= date)
    .filter((t) => t.allocations.every(stillCovered))
    .sort((a, b) => effectiveDate(b).localeCompare(effectiveDate(a)))[0]
  if (!tx.categoryId || !original) return ask('Match this refund to a purchase')

  // Refunds can be partial, so each line gives back its share; the last line takes the rounding.
  const refundCents = toCents(tx.amount)
  const purchaseCents = toCents(original.amount)
  let assigned = 0
  const allocations = original.allocations.map((a, i, all) => {
    const cents = i === all.length - 1 ? refundCents - assigned : Math.round((toCents(a.amount) * refundCents) / purchaseCents)
    assigned += cents
    return { ...a, amount: fromCents(cents) }
  })
  return { allocations, status: allocations.length > 1 ? 'check_split' : 'suggested' }
}

/** What auto-assign would do with this transaction, given everything else in the ledger. */
export function suggest(tx: Transaction, books: Books): Suggestion {
  if (tx.amount <= 0) return suggestRefund(tx, books)
  if (!tx.categoryId) return ask(PICK_CATEGORY)
  if (!tx.programId) return ask(PICK_PROGRAM)

  const { lines, reason } = eligibleLines(tx, books)
  if (!lines.length) return { allocations: [generalFunds(tx.amount)], status: 'suggested', reason }

  const { lines: chosen, ambiguous } = oneLinePerGrant(tx, lines, books)
  if (ambiguous) return ask(`Choose which ${ambiguous.name} line pays for this`)

  const allocations = fillGreedily(tx.amount, chosen)
  return { allocations, status: allocations.length > 1 ? 'check_split' : 'suggested' }
}

// ─── Applying ───────────────────────────────────────────────────────────────

/** Confirmed rows and a person's own choices are never changed automatically. */
export const isLocked = (t: Pick<Transaction, 'status' | 'source'>) => t.status === 'done' || t.source === 'manual'

/** Indirect allocation entries are booked by hand each quarter. */
const isIndirectEntry = (t: Transaction) => glCode(t.account) === INDIRECT_GL

function applySuggestion(tx: Transaction, books: Books): Transaction {
  if (isLocked(tx)) return tx
  if (isIndirectEntry(tx)) return { ...tx, status: 'done' }
  const coded = codeTransaction(tx, books)
  const { reason: _previous, ...rest } = coded
  const suggestion = suggest(coded, books)
  const { reason, ...result } = suggestion
  return { ...rest, ...result, ...(reason ? { reason } : {}), source: 'auto' }
}

/** Suggest for every unconfirmed transaction, oldest service date first, so earlier costs claim expiring money first. */
export function autoAssign(books: Books): Transaction[] {
  const redo = (t: Transaction) => !isLocked(t) && !isIndirectEntry(t)
  const ledger = new Map(books.transactions.map((t) => [t.id, redo(t) ? { ...t, allocations: [] } : t]))
  const order = [...ledger.values()]
    .filter((t) => !isLocked(t))
    .sort((a, b) => effectiveDate(a).localeCompare(effectiveDate(b)) || a.id.localeCompare(b.id))
  for (const { id } of order) ledger.set(id, applySuggestion(ledger.get(id)!, { ...books, transactions: [...ledger.values()] }))
  return books.transactions.map((t) => ledger.get(t.id)!)
}

export type Coding = Partial<Pick<Transaction, 'categoryId' | 'programId' | 'serviceDate'>>

/** A person changed this row's category, program or service date: update it and re-suggest for this row only. */
export function recode(tx: Transaction, coding: Coding, books: Books): Transaction {
  const { serviceDate: current, ...rest } = tx
  const { serviceDate: changed, ...codes } = coding
  const serviceDate = 'serviceDate' in coding ? changed : current
  return applySuggestion({ ...rest, ...codes, ...(serviceDate && serviceDate !== tx.date ? { serviceDate } : {}) }, books)
}

/** A person chose where this goes. That's final: it's confirmed, and auto-assign won't touch it again. */
export function assignManually(tx: Transaction, allocations: Allocation[]): Transaction {
  const { reason: _r, ...rest } = tx
  return { ...rest, allocations, source: 'manual', status: 'done' }
}

/** Ready to confirm: it has somewhere to go. */
export const canConfirm = (t: Transaction) => t.status !== 'done' && t.allocations.length > 0
