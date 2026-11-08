import { isInProgress, nextApplicationDeadline } from './applications.ts'
import { gapsForPrompt, isTopicLabel, type PromptGap } from './drafting.ts'
import type { Recommendation } from './opportunities.ts'
import { FACT_CATEGORIES, type Fact, type FactCategory, type Grant, type Question } from './types.ts'

/** Something a need holds up: an application in progress, or a recommended opportunity. */
export interface NeedRef {
  kind: 'application' | 'opportunity'
  id: string
  name: string
  /** Its application deadline, if known. */
  due?: string
}

export type Need =
  /** Approving this fact unblocks the work it's linked to. */
  | { kind: 'approve'; fact: Pick<Fact, 'id' | 'title' | 'category' | 'status'>; blocks: NeedRef[]; due?: string }
  /** No fact covers this topic yet: someone has to write one. */
  | { kind: 'add'; topic: string; blocks: NeedRef[]; due?: string }
  /** No approved fact in this category, so drafts can't draw on it. */
  | { kind: 'category'; category: FactCategory; blocks: []; due?: undefined }

type NeedGrant = Pick<Grant, 'id' | 'name' | 'stage' | 'questions' | 'deadlines'>

/**
 * What a question still lacks. Facts alone decide until the answer is drafted from PDFs; after that, the
 * draft's own gaps do, since the PDFs may cover topics no fact does (and the AI names gaps in its own words).
 */
function openGaps(q: Question, facts: Fact[]): PromptGap[] {
  const gaps = gapsForPrompt(q.prompt, facts)
  if (!q.docCitations?.length) return gaps
  return q.missing.flatMap((label) => {
    const gap = gaps.find((g) => g.label === label)
    if (gap) return [gap]
    return isTopicLabel(label) ? [] : [{ label, covering: [] }] // a topic label not in `gaps` is covered by now
  })
}

/**
 * Everything the knowledge base is missing for work in progress, most urgent first:
 * - unapproved facts cited by answers not yet approved
 * - topics questions ask about that no approved fact covers: approve a fact that covers it, or add one
 * - unapproved facts that would raise a recommendation's fit
 * - categories with no approved facts at all
 * Items are merged per fact or topic, list everything they block, and sort by the nearest deadline.
 */
export function neededNow(grants: NeedGrant[], facts: Fact[], recommendations: Pick<Recommendation, 'opportunity' | 'wouldStrengthen'>[] = []): Need[] {
  const byKey = new Map<string, Exclude<Need, { kind: 'category' }>>()
  const factsById = new Map(facts.map((f) => [f.id, f]))

  const add = (key: string, make: () => Exclude<Need, { kind: 'category' }>, ref: NeedRef) => {
    const need = byKey.get(key) ?? make()
    byKey.set(key, need)
    if (!need.blocks.some((r) => r.kind === ref.kind && r.id === ref.id)) need.blocks.push(ref)
    if (ref.due && (!need.due || ref.due < need.due)) need.due = ref.due
  }
  const approve = (f: Fact, ref: NeedRef) =>
    add(`fact:${f.id}`, () => ({ kind: 'approve', fact: { id: f.id, title: f.title, category: f.category, status: f.status }, blocks: [] }), ref)

  for (const g of grants.filter(isInProgress)) {
    const ref: NeedRef = { kind: 'application', id: g.id, name: g.name, due: nextApplicationDeadline(g)?.date }
    for (const q of g.questions.filter((q) => q.status !== 'approved')) {
      for (const id of q.citations) {
        const f = factsById.get(id)
        if (f && f.status !== 'approved') approve(f, ref)
      }
      for (const gap of openGaps(q, facts)) {
        if (gap.covering.length) gap.covering.forEach((f) => approve(f, ref))
        else add(`topic:${gap.label}`, () => ({ kind: 'add', topic: gap.label, blocks: [] }), ref)
      }
    }
  }

  for (const r of recommendations) {
    const ref: NeedRef = { kind: 'opportunity', id: r.opportunity.id, name: r.opportunity.program, due: r.opportunity.deadline }
    for (const { id } of r.wouldStrengthen) {
      const f = factsById.get(id)
      if (f && f.status !== 'approved') approve(f, ref)
    }
  }

  // Applications outrank opportunities at the same date: they're work already committed to.
  const weight = (n: Need) => (n.blocks.some((r) => r.kind === 'application') ? 0 : 1)
  const ranked = [...byKey.values()].sort(
    (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || weight(a) - weight(b) || b.blocks.length - a.blocks.length,
  )
  const categories: Need[] = FACT_CATEGORIES.filter((c) => !facts.some((f) => f.category === c && f.status === 'approved')).map((category) => ({ kind: 'category', category, blocks: [] }))
  return [...ranked, ...categories]
}
