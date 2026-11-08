import { parseDate } from './format.ts'
import { neededNow } from './needs.ts'
import type { Recommendation } from './opportunities.ts'
import type { Fact, FactCategory, Grant } from './types.ts'

/** What a fact does for the organization's applications and matches. */
export interface FactImpact {
  /** Answers (any application) that cite it. */
  answers: number
  /** Applications in progress that are waiting on it being approved. */
  unblocks: number
  /** Recommendations it backs (approved) or would strengthen (not yet approved). */
  recommendations: number
}

const NONE: FactImpact = { answers: 0, unblocks: 0, recommendations: 0 }

/**
 * Impact per fact id, so approvers can see what each approval is worth. Facts with no impact are absent;
 * read them through {@link impactOf}.
 */
export function factImpact(
  grants: Pick<Grant, 'id' | 'name' | 'stage' | 'questions' | 'deadlines'>[],
  facts: Fact[],
  recommendations: Pick<Recommendation, 'opportunity' | 'supportingFacts' | 'wouldStrengthen'>[] = [],
): Map<string, FactImpact> {
  const impact = new Map<string, FactImpact>()
  const bump = (id: string, key: keyof FactImpact, by = 1) => impact.set(id, { ...(impact.get(id) ?? NONE), [key]: (impact.get(id)?.[key] ?? 0) + by })

  for (const g of grants) for (const q of g.questions) for (const id of new Set(q.citations)) bump(id, 'answers')
  for (const need of neededNow(grants, facts, recommendations)) {
    if (need.kind !== 'approve') continue
    const apps = need.blocks.filter((r) => r.kind === 'application').length
    if (apps) bump(need.fact.id, 'unblocks', apps)
  }
  for (const r of recommendations) for (const id of new Set([...r.supportingFacts, ...r.wouldStrengthen].map((f) => f.id))) bump(id, 'recommendations')
  return impact
}

export const impactOf = (impact: Map<string, FactImpact>, id: string): FactImpact => impact.get(id) ?? NONE

/** Approval order: what unblocks applications first, then what strengthens matches, then what's cited most. */
export const byImpact = (a: FactImpact, b: FactImpact) => b.unblocks - a.unblocks || b.recommendations - a.recommendations || b.answers - a.answers

/** Facts in these categories describe things that change every year (budgets, audits, staffing). */
export const STALE_CATEGORIES: readonly FactCategory[] = ['finance', 'organization']
export const STALE_MONTHS = 12

/** A finance or organization fact not updated in the last {@link STALE_MONTHS} months. */
export function isStale(f: Pick<Fact, 'category' | 'updatedAt'>, today: string): boolean {
  if (!STALE_CATEGORIES.includes(f.category)) return false
  const cutoff = parseDate(today)
  cutoff.setMonth(cutoff.getMonth() - STALE_MONTHS)
  return parseDate(f.updatedAt) < cutoff
}
