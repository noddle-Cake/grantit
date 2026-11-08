// Fields read from a funder's award letter by an AI model. The model is asked for JSON matching
// AWARD_LETTER_SCHEMA, with null for anything the letter doesn't state. Its output is untrusted: parseAwardLetter
// keeps only values that are valid and leaves everything else empty, never guessing or repairing.

export interface ExtractedCategory {
  name: string
  budget: number
}

export interface AwardLetterFields {
  funder: string | null
  amount: number | null
  periodStart: string | null
  periodEnd: string | null
  funderFiscalYearStartMonth: number | null
  categories: ExtractedCategory[] | null
}

export const EMPTY_AWARD_LETTER: AwardLetterFields = {
  funder: null,
  amount: null,
  periodStart: null,
  periodEnd: null,
  funderFiscalYearStartMonth: null,
  categories: null,
}

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, 'null'], ...extra })

/** JSON Schema for structured output (strict mode: every property required, nulls for unknowns). */
export const AWARD_LETTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['funder', 'amount', 'periodStart', 'periodEnd', 'funderFiscalYearStartMonth', 'categories'],
  properties: {
    funder: nullable('string', { description: 'Name of the funding organization' }),
    amount: nullable('number', { description: 'Total award in US dollars, e.g. 60000' }),
    periodStart: nullable('string', { description: 'First day of the grant period, YYYY-MM-DD' }),
    periodEnd: nullable('string', { description: 'Last day of the grant period, YYYY-MM-DD' }),
    funderFiscalYearStartMonth: nullable('integer', { description: "Month the funder's fiscal year starts, 1-12 (October = 10)" }),
    categories: {
      type: ['array', 'null'],
      description: 'Approved budget lines, exactly as the letter lists them',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'budget'],
        properties: { name: { type: 'string' }, budget: { type: 'number', description: 'US dollars' } },
      },
    },
  },
} as const

export const AWARD_LETTER_INSTRUCTIONS = [
  'Extract the grant award terms from this award letter.',
  'Use only what the letter states. If the letter does not state a value, return null for it. Never estimate or infer a value.',
  'Dates must be YYYY-MM-DD. Amounts are plain numbers in US dollars without symbols or commas.',
  "funderFiscalYearStartMonth is the month number (1-12) the funder's fiscal year begins, only if the letter states it.",
  'categories lists each approved budget line with its dollar amount, in the order the letter gives them; null if the letter has no budget.',
].join('\n')

export interface ParsedAwardLetter {
  fields: AwardLetterFields
  /** What was dropped and why, for the UI and debugging. */
  problems: string[]
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function validDate(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? v : null
}

const validMoney = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && Math.abs(Math.round(v * 100) - v * 100) < 1e-6 ? Math.round(v * 100) / 100 : null

/** Validate model output (a JSON string or an already-parsed value). Never throws. */
export function parseAwardLetter(raw: unknown): ParsedAwardLetter {
  const problems: string[] = []
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return { fields: { ...EMPTY_AWARD_LETTER }, problems: ['The response was not valid JSON.'] }
    }
  }
  if (!isObj(data)) return { fields: { ...EMPTY_AWARD_LETTER }, problems: ['The response was not a JSON object.'] }

  const take = <T>(key: keyof AwardLetterFields, check: (v: unknown) => T | null): T | null => {
    const v = data[key]
    if (v === null || v === undefined) return null
    const ok = check(v)
    if (ok === null) problems.push(`Ignored ${key}: ${JSON.stringify(v)}`)
    return ok
  }

  const funder = take('funder', (v) => (typeof v === 'string' && v.trim() ? v.trim() : null))
  const amount = take('amount', validMoney)
  const periodStart = take('periodStart', validDate)
  const periodEnd = take('periodEnd', validDate)
  const funderFiscalYearStartMonth = take('funderFiscalYearStartMonth', (v) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 12 ? (v as number) : null))

  let categories: ExtractedCategory[] | null = null
  const rawCats = data.categories
  if (Array.isArray(rawCats)) {
    categories = []
    rawCats.forEach((c, i) => {
      const name = isObj(c) && typeof c.name === 'string' ? c.name.trim() : ''
      const budget = isObj(c) ? validMoney(c.budget) : null
      if (name && budget !== null) categories!.push({ name, budget })
      else problems.push(`Ignored category ${i + 1}: ${JSON.stringify(c)}`)
    })
    if (!categories.length) categories = null
  } else if (rawCats !== null && rawCats !== undefined) problems.push('Ignored categories: not a list')

  return { fields: { funder, amount, periodStart, periodEnd, funderFiscalYearStartMonth, categories }, problems }
}
