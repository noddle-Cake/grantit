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
export function grantFromOpportunity(o: Opportunity, ownerId: string, cover: number): Omit<Grant, 'id'> {
  // The funding period is unknown until award; assume the 12 months after the first of the month following the deadline.
  const [y, m] = o.deadline.split('-').map(Number)
  const startY = m === 12 ? y + 1 : y
  const startM = m === 12 ? 1 : m + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  const endM = startM === 1 ? 12 : startM - 1
  const endY = startM === 1 ? startY : startY + 1
  const lastDay = new Date(endY, endM, 0).getDate()
  return {
    name: o.program,
    funder: o.funder,
    amount: o.amountMax,
    stage: 'prospect',
    cover,
    ownerId,
    periodStart: `${startY}-${pad(startM)}-01`,
    periodEnd: `${endY}-${pad(endM)}-${pad(lastDay)}`,
    deadlines: [{ id: 'd-application', label: 'Application due', date: o.deadline, kind: 'application' }],
    rules: o.eligibility,
    categories: [],
    questions: [],
    allowSplit: false,
  }
}
