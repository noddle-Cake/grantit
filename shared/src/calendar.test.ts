import { describe, expect, it } from 'vitest'
import { addDays, addMonths, calendarEvents, eventsByDay, monthGrid, toICS, type CalendarEvent } from './calendar.ts'
import type { Opportunity } from './opportunities.ts'
import type { Grant } from './types.ts'

const TODAY = '2026-11-08'
const grant = (g: Partial<Grant> & Pick<Grant, 'id'>): Grant => ({
  name: `Grant ${g.id}`,
  funder: `Funder ${g.id}`,
  amount: 10000,
  stage: 'drafting',
  cover: 1,
  ownerId: 'u1',
  periodStart: '2026-01-01',
  periodEnd: '2026-12-31',
  deadlines: [],
  rules: [],
  categories: [],
  questions: [],
  allowSplit: false,
  ...g,
})
const opp = (o: Partial<Opportunity> & Pick<Opportunity, 'id'>): Opportunity => ({
  funder: `Funder ${o.id}`,
  program: `Program ${o.id}`,
  summary: '',
  amountMin: 1000,
  amountMax: 5000,
  deadline: '2027-01-15',
  focusAreas: [],
  eligibility: [],
  source: 'test',
  ...o,
})

describe('calendarEvents', () => {
  it('lists grant deadlines, open award period ends and untracked open opportunities, by date', () => {
    const events = calendarEvents(
      [
        grant({ id: 'a', deadlines: [{ id: 'd1', label: 'Application due', date: '2026-12-01', kind: 'application' }] }),
        grant({ id: 'b', stage: 'awarded', periodEnd: '2027-06-30', deadlines: [{ id: 'r1', label: 'Interim report', date: '2026-11-20', kind: 'report', done: true }] }),
      ],
      [opp({ id: 'o1' }), opp({ id: 'past', deadline: '2026-10-01' }), opp({ id: 'gone' }), opp({ id: 'tracked', funder: 'Funder a', program: 'Grant a' })],
      { today: TODAY, dismissed: ['gone'] },
    )
    expect(events.map((e) => [e.date, e.kind, e.title, !!e.done])).toEqual([
      ['2026-11-20', 'report', 'Interim report', true],
      ['2026-12-01', 'application', 'Application due', false],
      ['2027-01-15', 'opportunity', 'Program o1 closes', false],
      ['2027-06-30', 'period', 'Grant period ends', false],
    ])
  })
})

describe('eventsByDay', () => {
  it('groups events under their date', () => {
    const days = eventsByDay([{ date: '2026-11-08', n: 1 }, { date: '2026-11-09', n: 2 }, { date: '2026-11-08', n: 3 }])
    expect(days.get('2026-11-08')?.map((e) => e.n)).toEqual([1, 3])
  })
})

describe('monthGrid', () => {
  it('fills whole Sunday-first weeks around the month', () => {
    const weeks = monthGrid(2026, 10) // November 2026 starts on a Sunday
    expect(weeks).toHaveLength(5)
    expect(weeks[0][0]).toBe('2026-11-01')
    expect(weeks[4][6]).toBe('2026-12-05')
  })

  it('borrows days from the previous month', () => {
    const weeks = monthGrid(2027, 0) // January 2027 starts on a Friday
    expect(weeks[0].slice(0, 6)).toEqual(['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01'])
  })
})

describe('date steps', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addMonths('2026-12-18', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01')
  })
})

describe('toICS', () => {
  const event: CalendarEvent = { id: 'g1:d1', date: '2026-12-31', title: 'Final report, budget; narrative', kind: 'report', context: 'Youth Coding Lab' }
  const ics = toICS([event, { ...event, id: 'g1:d2', done: true }], { calendarName: 'Grantit deadlines', stamp: new Date('2026-11-08T12:00:00Z') })

  it('writes all-day events with escaped text and CRLF line endings', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101')
    expect(ics).toContain('SUMMARY:Final report\\, budget\\; narrative · Youth Coding Lab')
    expect(ics).toContain('DTSTAMP:20261108T120000Z')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('reminds a week ahead only for open deadlines', () => {
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(1)
  })

  it('folds lines over 75 octets', () => {
    const long = toICS([{ ...event, title: 'x'.repeat(200) }], { calendarName: 'c' })
    for (const line of long.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(long).toContain('\r\n x')
  })
})
