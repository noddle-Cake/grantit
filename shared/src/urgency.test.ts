import { describe, expect, it } from 'vitest'
import { seedState } from './seed.ts'
import { grantUrgency, isDemoOrg, urgencyByGrant, urgencySummary } from './urgency.ts'
import type { Grant, Transaction } from './types.ts'

const TODAY = '2026-11-08'
const { grants, transactions } = seedState
const seeded = urgencyByGrant(grants, transactions, TODAY, { simulate: true })

const grant = (id: string, periodEnd: string, over: Partial<Grant> = {}): Grant => ({
  id, name: id, funder: 'F', amount: 12000, stage: 'awarded', cover: 0, ownerId: 'u', periodStart: '2026-01-01', periodEnd, allowSplit: true,
  setupConfirmedAt: '2026-01-01', deadlines: [], rules: [], categories: [{ id: 'c1', name: 'L', budget: 12000 }], questions: [], ...over,
})
const monthly = (grantId: string, amount: number, months = 10): Transaction[] =>
  Array.from({ length: months }, (_, i) => ({
    id: `${grantId}-${i}`, date: `2026-${String(i + 1).padStart(2, '0')}-15`, vendor: 'V', description: '', account: '', amount,
    allocations: [{ grantId, budgetLineId: 'c1', amount }], origin: 'manual' as const, source: 'manual' as const, status: 'done' as const,
  }))

describe('grantUrgency', () => {
  it('marks both grants ending Dec 31 urgent, not just the first', () => {
    expect(seeded.get('g-anchor')).toMatchObject({ level: 'urgent', basis: 'actual', deadline: '2026-12-31', daysLeft: 53 })
    expect(seeded.get('g-familynights')).toMatchObject({ level: 'urgent', basis: 'actual', deadline: '2026-12-31', daysLeft: 53 })
  })

  it('marks close but different deadlines urgent independently', () => {
    const txs = [...monthly('a', 500), ...monthly('b', 500)]
    const map = urgencyByGrant([grant('a', '2026-12-30'), grant('b', '2026-12-31')], txs, TODAY, { simulate: false })
    expect([map.get('a')!.level, map.get('b')!.level]).toEqual(['urgent', 'urgent'])
  })

  it('still flags a later grant with a large share at risk when an earlier one is urgent', () => {
    const later = grant('later', '2027-06-30', { amount: 48000, categories: [{ id: 'c1', name: 'L', budget: 48000 }] })
    const txs = [...monthly('soon', 500), ...monthly('later', 500)]
    const map = urgencyByGrant([grant('soon', '2026-12-31'), later], txs, TODAY, { simulate: false })
    expect(map.get('soon')!.level).toBe('urgent')
    expect(map.get('later')).toMatchObject({ level: 'urgent', daysLeft: 234 })
  })

  it('is on track when the run rate will use up the money', () => {
    expect(grantUrgency(grant('a', '2026-12-31'), monthly('a', 1100), TODAY, { simulate: false })!.level).toBe('on-track')
  })

  it('projects from receipts, and never counts a projection as spent', () => {
    const u = seeded.get('g-anchor')!
    expect(u.spent).toBe(79_500)
    expect(u.projectedSpend).toBeGreaterThan(0)
    expect(u.atRisk).toBeCloseTo(96_000 - 79_500 - u.projectedSpend, 2)
  })

  it('reads an ended grant as ended, and setup and closed grants as nothing to spend', () => {
    expect(seeded.get('g-counseling')).toMatchObject({ level: 'ended', atRisk: 17_200 })
    expect(seeded.get('g-family-wellness')).toMatchObject({ level: 'unknown', basis: 'none' })
    expect(seeded.has('g-camp')).toBe(false)
    expect(seeded.has('g-wellness')).toBe(false)
  })
})

describe('simulated history', () => {
  const noHistory = seeded.get('g-mentor-expansion')!

  it('fills in for a grant with too few receipts, in demo mode', () => {
    expect(noHistory).toMatchObject({ basis: 'simulated', level: 'watch', spent: 300 })
    expect(urgencySummary(noHistory)).toContain('simulated')
  })

  it('never applies outside demo mode', () => {
    const real = urgencyByGrant(grants, transactions, TODAY, { simulate: false })
    expect(real.get('g-mentor-expansion')).toMatchObject({ basis: 'none', level: 'unknown', projectedSpend: 0, spent: 300 })
    expect([...real.values()].some((u) => u.basis === 'simulated')).toBe(false)
    expect(real.get('g-anchor')!.level).toBe('urgent')
  })

  it('is tied to the demo organization', () => {
    expect(isDemoOrg(seedState.org)).toBe(true)
    expect(isDemoOrg({ id: 'org-real' })).toBe(false)
  })

  it('with no receipts and no simulation, a close deadline is still urgent', () => {
    expect(grantUrgency(grant('a', '2026-12-31', { periodStart: '2026-11-01' }), [], TODAY, { simulate: false })).toMatchObject({ level: 'urgent', basis: 'none', atRisk: 12_000 })
  })
})
