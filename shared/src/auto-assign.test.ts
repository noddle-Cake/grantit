import { describe, expect, it } from 'vitest'
import { assignManually, autoAssign, canConfirm, codeTransaction, eligibleLines, recode, suggest, type Books } from './auto-assign.ts'
import { computeFinancials } from './finance.ts'
import { seedState } from './seed.ts'
import type { Grant, Transaction } from './types.ts'

const books: Books = seedState
const byId = (id: string) => seedState.transactions.find((t) => t.id === id)!
const lineName = (a: { grantId: string | null; budgetLineId?: string }) => {
  const g = seedState.grants.find((x) => x.id === a.grantId)
  return g ? `${g.name} · ${g.categories.find((c) => c.id === a.budgetLineId)?.name}` : 'General funds'
}
const summary = (t: Transaction) => ({ status: t.status, source: t.source, reason: t.reason, lines: t.allocations.map((a) => [lineName(a), a.amount]) })

const CAT = 'cat-training'
const PROGRAM = 'p-test'

const grant = (id: string, over: Partial<Grant> = {}): Grant => ({
  id,
  name: id,
  funder: 'F',
  amount: 1000,
  stage: 'awarded',
  cover: 0,
  ownerId: 'u',
  periodStart: '2026-01-01',
  periodEnd: '2026-12-31',
  allowSplit: true,
  setupConfirmedAt: '2026-01-01',
  programId: PROGRAM,
  deadlines: [],
  rules: [],
  categories: [{ id: 'c1', name: 'Line', budget: 1000, acceptedCategoryIds: [CAT] }],
  questions: [],
  ...over,
})

let n = 0
const expense = (over: Partial<Transaction> = {}): Transaction => ({
  id: `x${++n}`,
  date: '2026-06-15',
  vendor: 'Vendor',
  description: '',
  account: '6500 Training',
  amount: 100,
  categoryId: CAT,
  programId: PROGRAM,
  allocations: [],
  origin: 'manual',
  source: 'auto',
  status: 'needs_input',
  ...over,
})

const test = (grants: Grant[], transactions: Transaction[] = []): Books => ({
  grants,
  orgCategories: [{ id: CAT, name: 'Training', glAccounts: ['6500'] }],
  programs: [{ id: PROGRAM, name: 'Testing' }],
  transactions,
})

describe('seeded suggestions (acceptance checks)', () => {
  it('laptops go to General funds: no mentoring grant allows equipment', () => {
    expect(summary(byId('t-a8'))).toEqual({ status: 'suggested', source: 'auto', reason: 'No mentoring grant allows equipment', lines: [['General funds', 2400]] })
  })

  it('splits the fall picnic between Anchor and General funds', () => {
    expect(summary(byId('t-a4'))).toEqual({ status: 'check_split', source: 'auto', reason: undefined, lines: [['Anchor Mentors 2026 · Youth Activities', 2600], ['General funds', 600]] })
  })

  it('splits the Family Nights August venue, its program coming from payee history', () => {
    expect(byId('t-n3').programId).toBe('p-engagement')
    expect(summary(byId('t-n3')).lines).toEqual([['Family Nights 2026 · Family Events', 1300], ['General funds', 300]])
    expect(byId('t-n3').status).toBe('check_split')
  })

  it('puts the Dec 2025 deposit in General funds, explaining the date', () => {
    expect(summary(byId('t-a11'))).toEqual({ status: 'suggested', source: 'auto', reason: "Outside every mentoring grant's period", lines: [['General funds', 1100]] })
  })

  it('splits the winter training deposit across the soonest-ending mentoring grants', () => {
    expect(byId('t-u4').programId).toBe('p-mentoring')
    expect(summary(byId('t-u4')).lines).toEqual([['Anchor Mentors 2026 · Mentor Training', 1200], ['Mentor Expansion 2026–27 · Training', 300]])
    expect(byId('t-u4').status).toBe('check_split')
  })

  it('re-suggests all of the deposit to Mentor Expansion when its service date moves to January', () => {
    const moved = recode(byId('t-u4'), { serviceDate: '2027-01-15' }, books)
    expect(summary(moved)).toEqual({ status: 'suggested', source: 'auto', reason: undefined, lines: [['Mentor Expansion 2026–27 · Training', 1500]] })
    expect(moved.serviceDate).toBe('2027-01-15')
  })

  it('asks for a program on the printer toner', () => {
    expect(byId('t-u3')).toMatchObject({ status: 'needs_input', reason: 'Pick a program', allocations: [], categoryId: 'cat-supplies' })
  })

  it('gives telehealth software a reason once a program is chosen', () => {
    const t = byId('t-u2')
    expect(t.status).toBe('needs_input')
    expect(summary(recode(t, { programId: 'p-counseling' }, books))).toMatchObject({ reason: "Outside every family counseling grant's period", lines: [['General funds', 360]] })
    expect(summary(recode(t, { programId: 'p-wellness' }, books))).toMatchObject({ reason: 'Family Wellness Partnership has no budget yet', lines: [['General funds', 360]] })
  })

  it('never lets Admin and shared reach a grant, even one wrongly mapped to it', () => {
    const t = recode(byId('t-u1'), { programId: 'p-admin' }, books)
    expect(t).toMatchObject({ status: 'suggested', allocations: [{ grantId: null, amount: 820 }] })
    const mapped: Books = { ...books, grants: books.grants.map((g) => (g.id === 'g-anchor' ? { ...g, programId: 'p-admin' } : g)) }
    expect(eligibleLines({ ...t, categoryId: 'cat-training' }, mapped).lines).toEqual([])
  })

  it('leaves the seed with everything else confirmed by a person', () => {
    const open = seedState.transactions.filter((t) => t.status !== 'done').map((t) => t.id).sort()
    expect(open).toEqual(['t-a11', 't-a4', 't-a8', 't-n3', 't-u1', 't-u2', 't-u3', 't-u4'])
    expect(seedState.transactions.filter((t) => t.status === 'done').every((t) => t.source === 'manual')).toBe(true)
  })

  it('every seeded GL code maps to a category, with Activities and Travel now apart', () => {
    expect(seedState.transactions.filter((t) => !t.categoryId)).toEqual([])
    expect(seedState.transactions.filter((t) => t.account === '6600 Activities')).toEqual([])
    expect(byId('t-a1')).toMatchObject({ account: '6650 Activities', categoryId: 'cat-activities' })
    expect(byId('t-w2')).toMatchObject({ account: '6600 Travel', categoryId: 'cat-travel' })
  })
})

describe('eligibility', () => {
  it('includes both ends of the grant period and nothing outside', () => {
    const b = test([grant('a')])
    const eligibleOn = (date: string) => eligibleLines(expense({ date }), b).lines.length
    expect([eligibleOn('2025-12-31'), eligibleOn('2026-01-01'), eligibleOn('2026-12-31'), eligibleOn('2027-01-01')]).toEqual([0, 1, 1, 0])
  })

  it('uses the service date when there is one', () => {
    const t = expense({ date: '2027-02-01', serviceDate: '2026-12-31' })
    expect(eligibleLines(t, test([grant('a')])).lines).toHaveLength(1)
  })

  it('skips lines with nothing left, not counting the row’s own charges', () => {
    const own = expense({ id: 'own', allocations: [{ grantId: 'a', budgetLineId: 'c1', amount: 1000 }], status: 'suggested' })
    const b = test([grant('a')], [own])
    expect(eligibleLines(own, b).lines[0].remaining).toBe(1000)
    expect(eligibleLines(expense(), b)).toEqual({ lines: [], reason: 'No training money left on any testing grant' })
  })

  it('skips grants with no budget or a submitted final report, but not an earlier report', () => {
    const unset = grant('a', { name: 'Not Set Up', setupConfirmedAt: undefined, categories: [] })
    expect(eligibleLines(expense(), test([unset])).reason).toBe('Not Set Up has no budget yet')
    const finished = grant('a', { name: 'Finished', deadlines: [{ id: 'd', label: 'Final', date: '2027-01-31', kind: 'report', done: true }] })
    expect(eligibleLines(expense(), test([finished])).reason).toBe("Finished's final report is submitted")
    const earlyReport = grant('a', { deadlines: [{ id: 'd', label: 'Q1', date: '2026-04-15', kind: 'report', done: true }] })
    expect(eligibleLines(expense(), test([earlyReport])).lines).toHaveLength(1)
  })

  it('sorts by end date, then most remaining', () => {
    const b = test([grant('later', { periodEnd: '2027-06-30' }), grant('small', { amount: 100, categories: [{ id: 'c1', name: 'L', budget: 100, acceptedCategoryIds: [CAT] }] }), grant('big')])
    expect(eligibleLines(expense(), b).lines.map((l) => l.grant.id)).toEqual(['big', 'small', 'later'])
  })
})

describe('suggest', () => {
  const small = (id: string, budget: number, periodEnd: string) => grant(id, { periodEnd, categories: [{ id: 'c1', name: 'Line', budget, acceptedCategoryIds: [CAT] }] })

  it('fills two grants greedily and sends the remainder to General funds', () => {
    const b = test([small('late', 300, '2027-06-30'), small('soon', 200, '2026-09-30')])
    expect(suggest(expense({ amount: 750.5 }), b)).toEqual({
      status: 'check_split',
      allocations: [
        { grantId: 'soon', budgetLineId: 'c1', amount: 200 },
        { grantId: 'late', budgetLineId: 'c1', amount: 300 },
        { grantId: null, amount: 250.5 },
      ],
    })
  })

  it('is plainly suggested when one line holds it all', () => {
    expect(suggest(expense(), test([grant('a')]))).toEqual({ status: 'suggested', allocations: [{ grantId: 'a', budgetLineId: 'c1', amount: 100 }] })
  })

  it('sends everything to General funds with a reason when nothing is eligible', () => {
    expect(suggest(expense(), test([grant('a', { programId: 'p-other' })]))).toEqual({ status: 'suggested', reason: 'No grant funds testing', allocations: [{ grantId: null, amount: 100 }] })
    const noAccept = grant('a', { categories: [{ id: 'c1', name: 'L', budget: 10, acceptedCategoryIds: ['other'] }] })
    expect(suggest(expense(), test([noAccept]))).toMatchObject({ status: 'suggested', reason: 'No testing grant allows training' })
  })

  it('asks instead of guessing when a program or category is blank', () => {
    expect(suggest(expense({ programId: undefined }), test([grant('a')]))).toEqual({ allocations: [], status: 'needs_input', reason: 'Pick a program' })
    expect(suggest(expense({ categoryId: undefined }), test([grant('a')]))).toEqual({ allocations: [], status: 'needs_input', reason: 'Pick a category' })
  })

  describe('when two lines of one grant accept the category', () => {
    const twoLines = grant('a', { categories: [{ id: 'c1', name: 'One', budget: 500, acceptedCategoryIds: [CAT] }, { id: 'c2', name: 'Two', budget: 500, acceptedCategoryIds: [CAT] }] })

    it('picks the line this payee was last charged to', () => {
      const past = expense({ date: '2026-02-01', status: 'done', source: 'manual', allocations: [{ grantId: 'a', budgetLineId: 'c2', amount: 10 }] })
      expect(suggest(expense(), test([twoLines], [past])).allocations).toEqual([{ grantId: 'a', budgetLineId: 'c2', amount: 100 }])
    })

    it('asks when there is no history', () => {
      expect(suggest(expense(), test([twoLines]))).toEqual({ allocations: [], status: 'needs_input', reason: 'Choose which a line pays for this' })
    })

    it('chooses Family Counseling’s contract line by payee in the seed', () => {
      const interpreter = { ...byId('t-c1'), id: 'new', date: '2026-08-01', allocations: [], status: 'needs_input' as const, source: 'auto' as const }
      expect(suggest(interpreter, books).allocations).toEqual([{ grantId: 'g-counseling', budgetLineId: 'c3', amount: 2600 }])
    })
  })

  describe('refunds', () => {
    const purchase = (over: Partial<Transaction> = {}) => expense({ id: 'p', date: '2026-03-01', amount: 200, status: 'done', source: 'manual', allocations: [{ grantId: 'a', budgetLineId: 'c1', amount: 200 }], ...over })

    it('copies the matched purchase’s allocation', () => {
      const r = suggest(expense({ amount: -50 }), test([grant('a')], [purchase()]))
      expect(r).toEqual({ status: 'suggested', allocations: [{ grantId: 'a', budgetLineId: 'c1', amount: -50 }] })
    })

    it('shares a refund across a split purchase, to the cent', () => {
      const split = purchase({ amount: 300, allocations: [{ grantId: 'a', budgetLineId: 'c1', amount: 200 }, { grantId: null, amount: 100 }] })
      const r = suggest(expense({ amount: -100 }), test([grant('a')], [split]))
      expect(r).toEqual({ status: 'check_split', allocations: [{ grantId: 'a', budgetLineId: 'c1', amount: -66.67 }, { grantId: null, amount: -33.33 }] })
    })

    it('asks when no purchase matches payee and category, or the grant has since ended', () => {
      const ask = { allocations: [], status: 'needs_input', reason: 'Match this refund to a purchase' }
      expect(suggest(expense({ amount: -50, vendor: 'Other' }), test([grant('a')], [purchase()]))).toEqual(ask)
      expect(suggest(expense({ amount: -50, categoryId: 'cat-x' }), test([grant('a')], [purchase()]))).toEqual(ask)
      expect(suggest(expense({ amount: -50, date: '2027-02-01' }), test([grant('a')], [purchase()]))).toEqual(ask)
    })
  })
})

describe('autoAssign', () => {
  it('lets the oldest expense claim the money first, whatever the ledger order', () => {
    const newer = expense({ id: 'newer', date: '2026-08-01', amount: 800 })
    const older = expense({ id: 'older', date: '2026-03-01', amount: 800 })
    const [n2, o2] = autoAssign(test([grant('a')], [newer, older]))
    expect(o2.allocations).toEqual([{ grantId: 'a', budgetLineId: 'c1', amount: 800 }])
    expect(n2.allocations).toEqual([{ grantId: 'a', budgetLineId: 'c1', amount: 200 }, { grantId: null, amount: 600 }])
  })

  it('never changes confirmed or manual rows, and counts their money', () => {
    const confirmed = expense({ id: 'd', status: 'done', source: 'auto', allocations: [{ grantId: 'a', budgetLineId: 'c1', amount: 400 }], amount: 400 })
    const manual = expense({ id: 'm', status: 'suggested', source: 'manual', allocations: [{ grantId: null, amount: 100 }] })
    const open = expense({ id: 'o', amount: 900 })
    const [d, m, o] = autoAssign(test([grant('a')], [confirmed, manual, open]))
    expect(d).toBe(confirmed)
    expect(m).toBe(manual)
    expect(o.allocations).toEqual([{ grantId: 'a', budgetLineId: 'c1', amount: 600 }, { grantId: null, amount: 300 }])
  })

  it('throws away its own earlier suggestions when it runs again', () => {
    const stale = expense({ id: 's', status: 'suggested', allocations: [{ grantId: null, amount: 100 }] })
    expect(autoAssign(test([grant('a')], [stale]))[0].allocations).toEqual([{ grantId: 'a', budgetLineId: 'c1', amount: 100 }])
  })

  it('leaves indirect allocation entries as they are, and marks them done', () => {
    const entry = expense({ id: 'i', account: '7900 Indirect', status: 'suggested', allocations: [{ grantId: 'a', budgetLineId: 'c1', amount: 100 }] })
    expect(autoAssign(test([grant('a')], [entry]))[0]).toMatchObject({ status: 'done', allocations: entry.allocations })
  })

  it('reproduces the seed when run again', () => {
    expect(autoAssign(books)).toEqual(seedState.transactions)
  })
})

describe('recode', () => {
  it('re-suggests only the changed row; confirmed rows stay exactly as they were', () => {
    const confirmed = byId('t-a1')
    const after = seedState.transactions.map((t) => (t.id === 't-u3' ? recode(t, { programId: 'p-workshops' }, books) : t))
    expect(after.find((t) => t.id === 't-u3')).toMatchObject({ status: 'suggested', allocations: [{ grantId: 'g-safe', budgetLineId: 'c2', amount: 410 }] })
    expect(after.find((t) => t.id === 't-a1')).toBe(confirmed)
    expect(after.filter((t) => t.id !== 't-u3')).toEqual(seedState.transactions.filter((t) => t.id !== 't-u3'))
  })

  it('updates the coding on a manual or confirmed row but keeps its allocations', () => {
    const manual = assignManually(byId('t-u4'), [{ grantId: 'g-anchor', budgetLineId: 'c2', amount: 1500 }])
    const moved = recode(manual, { serviceDate: '2027-01-15' }, books)
    expect(moved).toMatchObject({ serviceDate: '2027-01-15', source: 'manual', status: 'done', allocations: manual.allocations })
  })

  it('clears a service date set back to the transaction date', () => {
    const t = { ...byId('t-u4'), serviceDate: '2027-01-15' }
    expect(recode(t, { serviceDate: t.date }, books).serviceDate).toBeUndefined()
  })
})

describe('codeTransaction', () => {
  const coded = (over: Partial<Transaction>) => codeTransaction(expense({ categoryId: undefined, programId: undefined, ...over }), books)

  it('takes the category from the GL account', () => {
    expect(coded({ account: '6800 Equipment' }).categoryId).toBe('cat-equipment')
  })

  it('falls back to the payee’s last category when the GL code is unmapped', () => {
    expect(coded({ account: '9999 Misc', vendor: 'Coastal Youth Training Institute' }).categoryId).toBe('cat-training')
  })

  it('takes the program from the same payee and category, most recent first', () => {
    expect(coded({ vendor: 'Bayside Outings', account: '6650 Activities' }).programId).toBe('p-mentoring')
    expect(coded({ vendor: 'Bayside Outings', account: '6500 Training' }).programId).toBeUndefined()
  })

  it('keeps a program already set by a QuickBooks class', () => {
    expect(coded({ vendor: 'Bayside Outings', account: '6650 Activities', programId: 'p-workshops' }).programId).toBe('p-workshops')
  })
})

describe('confirming', () => {
  it('needs somewhere to go', () => {
    expect(canConfirm(byId('t-a8'))).toBe(true)
    expect(canConfirm(byId('t-u3'))).toBe(false)
    expect(canConfirm(byId('t-a1'))).toBe(false)
  })

  it('counts unconfirmed allocations in spending', () => {
    const anchor = seedState.grants.find((g) => g.id === 'g-anchor')!
    expect(computeFinancials(anchor, seedState.transactions).categories.map((c) => c.spent)).toEqual([45_000, 12_000, 15_000, 3_000, 4_500])
  })
})
