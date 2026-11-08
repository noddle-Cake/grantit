import { isInProgress, nextApplicationDeadline } from './applications.ts'
import { parseDate } from './format.ts'
import type { Fact, Grant } from './types.ts'

/**
 * A funding opportunity the organization is not pursuing yet. Today these are demo listings
 * (opportunities-demo.ts); a real search of public grant listings will produce the same shape.
 */
export interface Opportunity {
  id: string
  funder: string
  program: string
  summary: string
  amountMin: number
  amountMax: number
  deadline: string // ISO date the application is due
  /** Topics the funder supports, matched against the tags on approved facts. */
  focusAreas: string[]
  eligibility: string[]
  source: string
}

export interface Recommendation {
  opportunity: Opportunity
  /** Share of the funder's focus areas backed by approved facts, 0–1. */
  fit: number
  matchedAreas: string[]
  /** Approved facts that back the match, most relevant first (at most 3). */
  supportingFacts: Pick<Fact, 'id' | 'title'>[]
  /** Facts not yet approved that cover focus areas nothing approved covers: approving them raises the fit. */
  wouldStrengthen: Pick<Fact, 'id' | 'title'>[]
}

const norm = (s: string) => s.trim().toLowerCase()

/** True if the organization already tracks this opportunity as a grant (same funder and program name). */
export const isTracked = (o: Opportunity, grants: Pick<Grant, 'funder' | 'name'>[]) =>
  grants.some((g) => norm(g.funder) === norm(o.funder) && norm(g.name) === norm(o.program))

/**
 * Rank open opportunities by how well the organization's approved facts cover the funder's focus areas.
 * Only approved facts count, the same rule drafting follows, so a recommendation never rests on
 * unverified information. Skips opportunities that are past their deadline, dismissed, already tracked,
 * or matched by nothing.
 */
export function recommendOpportunities(
  opportunities: Opportunity[],
  facts: Fact[],
  grants: Pick<Grant, 'funder' | 'name'>[],
  { today, dismissed = [] }: { today: string; dismissed?: string[] },
): Recommendation[] {
  const approved = facts.filter((f) => f.status === 'approved')
  const unapproved = facts.filter((f) => f.status !== 'approved')
  const known = new Set(approved.flatMap((f) => f.tags.map(norm)))

  return opportunities
    .filter((o) => o.deadline >= today && !dismissed.includes(o.id) && !isTracked(o, grants))
    .map((o) => {
      const areas = o.focusAreas.map(norm)
      const matchedAreas = areas.filter((a) => known.has(a))
      const supportingFacts = approved
        .map((f) => ({ f, hits: f.tags.map(norm).filter((t) => matchedAreas.includes(t)).length }))
        .filter((x) => x.hits > 0)
        .sort((a, b) => b.hits - a.hits || a.f.title.localeCompare(b.f.title))
        .slice(0, 3)
        .map(({ f }) => ({ id: f.id, title: f.title }))
      const unmatched = areas.filter((a) => !known.has(a))
      const wouldStrengthen = unapproved.filter((f) => f.tags.some((t) => unmatched.includes(norm(t)))).map((f) => ({ id: f.id, title: f.title }))
      return { opportunity: o, fit: areas.length ? matchedAreas.length / areas.length : 0, matchedAreas, supportingFacts, wouldStrengthen }
    })
    .filter((r) => r.matchedAreas.length > 0)
    .sort((a, b) => b.fit - a.fit || a.opportunity.deadline.localeCompare(b.opportunity.deadline))
}

/** The prospect grant created when staff add an opportunity to their pipeline. */
/** The funding period is unknown until award; assume the 12 months from the first of the month after the deadline. */
export function assumedPeriod(o: Pick<Opportunity, 'deadline'>): { start: string; end: string } {
  const [y, m] = o.deadline.split('-').map(Number)
  const startY = m === 12 ? y + 1 : y
  const startM = m === 12 ? 1 : m + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  const endM = startM === 1 ? 12 : startM - 1
  const endY = startM === 1 ? startY : startY + 1
  const lastDay = new Date(endY, endM, 0).getDate()
  return { start: `${startY}-${pad(startM)}-01`, end: `${endY}-${pad(endM)}-${pad(lastDay)}` }
}

export function grantFromOpportunity(o: Opportunity, ownerId: string, cover: number): Omit<Grant, 'id'> {
  const period = assumedPeriod(o)
  return {
    name: o.program,
    funder: o.funder,
    amount: o.amountMax,
    stage: 'prospect',
    cover,
    ownerId,
    periodStart: period.start,
    periodEnd: period.end,
    deadlines: [{ id: 'd-application', label: 'Application due', date: o.deadline, kind: 'application' }],
    rules: o.eligibility,
    categories: [],
    questions: [],
    allowSplit: false,
  }
}

// ─── Go / no-go ──────────────────────────────────────────────────────────────

export interface RequirementCheck {
  requirement: string
  /** An approved fact that likely shows the requirement is met; absent when none was found. */
  evidence?: Pick<Fact, 'id' | 'title'>
}

const REQ_STOP = new Set('with that this from have least their your than under over into must will required organizations'.split(' '))
const words = (s: string) => (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !REQ_STOP.has(w))
const stem = (w: string) => w.slice(0, 5)

/**
 * For each of the funder's requirements, the approved fact that best matches its key words (at least half of
 * them, compared by their first five letters). A suggestion for a person to confirm, never a ruling: an
 * unmatched requirement means "not found in your facts", not "not met".
 */
export function checkRequirements(o: Pick<Opportunity, 'eligibility'>, facts: Fact[]): RequirementCheck[] {
  const approved = facts
    .filter((f) => f.status === 'approved')
    .map((f) => ({ f, stems: new Set([...words(`${f.title} ${f.content}`), ...f.tags.flatMap((t) => t.split('-'))].map(stem)) }))
  return o.eligibility.map((requirement) => {
    const need = [...new Set(words(requirement).map(stem))]
    let best: { f: Fact; hits: number } | undefined
    for (const { f, stems } of approved) {
      const hits = need.filter((w) => stems.has(w)).length
      if (hits && hits * 2 >= need.length && hits > (best?.hits ?? 0)) best = { f, hits }
    }
    return { requirement, evidence: best && { id: best.f.id, title: best.f.title } }
  })
}

export const CLASH_DAYS = 7

/** Applications in progress due within {@link CLASH_DAYS} days of the opportunity's deadline, soonest first. */
export function deadlineClashes(
  o: Pick<Opportunity, 'deadline'>,
  grants: Pick<Grant, 'id' | 'name' | 'stage' | 'deadlines'>[],
): { id: string; name: string; due: string }[] {
  const at = parseDate(o.deadline).getTime()
  return grants
    .filter(isInProgress)
    .map((g) => ({ id: g.id, name: g.name, due: nextApplicationDeadline(g)?.date }))
    .filter((g): g is { id: string; name: string; due: string } => !!g.due && Math.abs(parseDate(g.due).getTime() - at) <= CLASH_DAYS * 86_400_000)
    .sort((a, b) => a.due.localeCompare(b.due))
}

/** Median amount of grants the organization has won (awarded, reporting or closed); undefined if none. */
export function medianAward(grants: Pick<Grant, 'stage' | 'amount'>[]): number | undefined {
  const won = grants.filter((g) => g.stage === 'awarded' || g.stage === 'reporting' || g.stage === 'closed').map((g) => g.amount).sort((a, b) => a - b)
  if (!won.length) return undefined
  const mid = Math.floor(won.length / 2)
  return won.length % 2 ? won[mid] : (won[mid - 1] + won[mid]) / 2
}
