import type { Fact, Question } from './types.ts'
import { wordCount } from './format.ts'

/**
 * Grounded drafting engine (client-side mock).
 *
 * The production version should call an LLM with ONLY the approved facts as
 * context and require it to return citations per sentence. This mock keeps the
 * same contract — `DraftResult` — so the UI does not change when the real
 * service is plugged in behind `draftAnswer`.
 */
export interface DraftResult {
  text: string
  citations: string[]
  missing: string[]
  /** facts that would help but are not yet approved */
  blockedBy: string[]
}

interface Topic {
  key: string
  label: string
  triggers: RegExp
  match: (f: Fact) => boolean
}

const hasTag = (...tags: string[]) => (f: Fact) => tags.some((t) => f.tags.includes(t))

const TOPICS: Topic[] = [
  { key: 'mission', label: 'mission statement', triggers: /mission|organi[sz]ation|who you are|describe your/i, match: (f) => f.category === 'mission' },
  { key: 'history', label: 'organizational history', triggers: /history|founded|track record|experience/i, match: hasTag('history') },
  { key: 'need', label: 'community need data', triggers: /need|problem|challenge|why/i, match: hasTag('need') },
  { key: 'population', label: 'population served / demographics', triggers: /population|served|beneficiar|demographic|families|data on/i, match: (f) => f.category === 'beneficiaries' },
  { key: 'program', label: 'program description', triggers: /program|activities|project|approach|describe the proposed/i, match: (f) => f.category === 'program' || f.category === 'service' },
  { key: 'mentorship', label: 'mentorship program details', triggers: /mentor/i, match: hasTag('mentorship', 'mentoring') },
  { key: 'counseling', label: 'counseling program details', triggers: /counsel|therap|clinical/i, match: hasTag('counseling') },
  { key: 'workshops', label: 'school workshop details', triggers: /workshop|school|safety|bully|prevention/i, match: hasTag('workshops', 'safety') },
  { key: 'mental-health', label: 'mental health data', triggers: /mental health|wellness|well-being|emotional|anxiety|coping/i, match: hasTag('mental-health') },
  { key: 'parents', label: 'parent support group details', triggers: /parent|caregiver/i, match: hasTag('parents', 'caregivers') },
  { key: 'stem', label: 'STEM program details', triggers: /stem|science|robotic|coding/i, match: hasTag('stem') },
  { key: 'digital', label: 'digital access / device data', triggers: /digital|device|internet|connectivity|technology/i, match: hasTag('digital', 'devices', 'connectivity') },
  { key: 'outcomes', label: 'measurable outcomes', triggers: /outcome|result|impact|achieve|expect/i, match: (f) => f.category === 'outcome' },
  { key: 'evaluation', label: 'evaluation method', triggers: /evaluat|measure|assess|track/i, match: hasTag('evaluation') },
  { key: 'capacity', label: 'organizational capacity', triggers: /capacity|staff|volunteer|qualif/i, match: hasTag('capacity', 'volunteers') },
  { key: 'sustainability', label: 'sustainability / funding plan', triggers: /sustain|after the grant|continue|long-term|future funding/i, match: hasTag('sustainability') },
  { key: 'budget', label: 'budget information', triggers: /budget|cost|financ/i, match: (f) => f.category === 'finance' },
]

const STOP = new Set('the a an and or of to in on for with your you how what will is are be by this that from its it describe include'.split(' '))
const tokens = (s: string) => s.toLowerCase().match(/[a-z]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? []

function score(f: Fact, qTokens: string[], topics: Topic[]): number {
  const hay = new Set([...tokens(f.title + ' ' + f.content), ...f.tags])
  let s = qTokens.reduce((acc, t) => acc + (hay.has(t) || [...hay].some((h) => h.startsWith(t.slice(0, 5))) ? 1 : 0), 0)
  s += topics.filter((t) => t.match(f)).length * 3
  return s
}

/** Trim to a word limit at a sentence boundary where possible. */
export function fitToLimit(sentences: { text: string; factId: string }[], limit: number) {
  const out: typeof sentences = []
  let n = 0
  for (const s of sentences) {
    const w = wordCount(s.text)
    if (n + w > limit) continue // try a shorter one later rather than truncating mid-claim
    out.push(s)
    n += w
  }
  return out
}

export function draftAnswer(q: Pick<Question, 'prompt' | 'wordLimit'>, facts: Fact[]): DraftResult {
  const topics = TOPICS.filter((t) => t.triggers.test(q.prompt))
  const qTokens = tokens(q.prompt)
  const approved = facts.filter((f) => f.status === 'approved')

  const ranked = approved
    .map((f) => ({ f, s: score(f, qTokens, topics) }))
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)

  const sentences = ranked.flatMap(({ f }) =>
    f.content.split(/(?<=[.!?])\s+/).filter(Boolean).map((text) => ({ text, factId: f.id })),
  )
  const kept = fitToLimit(sentences, q.wordLimit)

  const missing = topics.filter((t) => !approved.some(t.match)).map((t) => t.label)
  const blockedBy = facts
    .filter((f) => f.status !== 'approved' && (topics.some((t) => t.match(f)) || score(f, qTokens, []) >= 2))
    .map((f) => f.id)

  return {
    text: kept.map((s) => s.text).join(' '),
    citations: [...new Set(kept.map((s) => s.factId))],
    missing,
    blockedBy,
  }
}

/** Simulated latency so the UI's loading states are exercised. */
export function draftAnswerAsync(q: Pick<Question, 'prompt' | 'wordLimit'>, facts: Fact[]): Promise<DraftResult> {
  return new Promise((resolve) => setTimeout(() => resolve(draftAnswer(q, facts)), 700 + Math.random() * 600))
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ClaimIssue {
  sentence: string
  reason: string
}

/**
 * Flags sentences containing figures (numbers, %, $) that do not appear in any
 * approved fact. A real implementation would do entailment checking per sentence.
 */
export function findUnsupportedClaims(answer: string, facts: Fact[]): ClaimIssue[] {
  const corpus = facts.filter((f) => f.status === 'approved').map((f) => f.content).join(' ')
  const sentences = answer.split(/(?<=[.!?])\s+/).filter((s) => s.trim())
  const issues: ClaimIssue[] = []
  for (const s of sentences) {
    const figures = s.match(/\$?\d[\d,.]*%?/g) ?? []
    const bad = figures.filter((n) => !corpus.includes(n.replace(/[.,]$/, '')))
    if (bad.length) issues.push({ sentence: s, reason: `Figure ${bad.join(', ')} not found in approved facts` })
  }
  return issues
}

export interface ApplicationCheck {
  unanswered: number
  overLimit: number
  unapproved: number
  unsupported: number
  ready: boolean
}

export function checkApplication(questions: Question[], facts: Fact[]): ApplicationCheck {
  const unanswered = questions.filter((q) => !q.answer.trim()).length
  const overLimit = questions.filter((q) => wordCount(q.answer) > q.wordLimit).length
  const unapproved = questions.filter((q) => q.answer.trim() && q.status !== 'approved').length
  const unsupported = questions.reduce((n, q) => n + findUnsupportedClaims(q.answer, facts).length, 0)
  return { unanswered, overLimit, unapproved, unsupported, ready: questions.length > 0 && !unanswered && !overLimit && !unapproved && !unsupported }
}
