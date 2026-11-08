import { parseDate, toISO } from './format.ts'
import { isTracked, type Opportunity } from './opportunities.ts'
import { isOpenAward } from './setup.ts'
import type { Deadline, Grant } from './types.ts'

// ─── Events ──────────────────────────────────────────────────────────────────

/** Grant deadlines keep their own kind; open opportunities and award period ends get theirs. */
export type CalendarEventKind = Deadline['kind'] | 'opportunity' | 'period'

export interface CalendarEvent {
  id: string
  date: string // ISO date; every Grantit event is all-day
  title: string
  kind: CalendarEventKind
  /** The grant or funder the event belongs to, shown under the title. */
  context: string
  done?: boolean
  grantId?: string
  opportunityId?: string
  /** The grant's cover colour (0-5), when the event belongs to a grant. */
  cover?: number
}

/**
 * Everything with a date the organization should see on a calendar: each grant's deadlines, the end of every
 * open award's period, and the deadlines of open opportunities not yet tracked or dismissed.
 */
export function calendarEvents(
  grants: Grant[],
  opportunities: Opportunity[] = [],
  { today, dismissed = [] }: { today: string; dismissed?: string[] },
): CalendarEvent[] {
  const fromGrants = grants.flatMap((g) => {
    const deadlines: CalendarEvent[] = g.deadlines.map((d) => ({
      id: `${g.id}:${d.id}`,
      date: d.date,
      title: d.label,
      kind: d.kind,
      context: g.name,
      done: d.done,
      grantId: g.id,
      cover: g.cover,
    }))
    const periodEnd: CalendarEvent[] = isOpenAward(g) && g.periodEnd
      ? [{ id: `${g.id}:period-end`, date: g.periodEnd, title: 'Grant period ends', kind: 'period', context: g.name, grantId: g.id, cover: g.cover }]
      : []
    return [...deadlines, ...periodEnd]
  })
  const fromOpportunities: CalendarEvent[] = opportunities
    .filter((o) => o.deadline >= today && !dismissed.includes(o.id) && !isTracked(o, grants))
    .map((o) => ({ id: `opp:${o.id}`, date: o.deadline, title: `${o.program} closes`, kind: 'opportunity', context: o.funder, opportunityId: o.id }))
  return sortEvents([...fromGrants, ...fromOpportunities])
}

export const sortEvents = <T extends { date: string; title: string }>(events: T[]) =>
  [...events].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))

/** Events keyed by ISO date. */
export function eventsByDay<T extends { date: string }>(events: T[]): Map<string, T[]> {
  const days = new Map<string, T[]>()
  for (const e of events) days.set(e.date, [...(days.get(e.date) ?? []), e])
  return days
}

// ─── Month grid ──────────────────────────────────────────────────────────────

/**
 * The weeks shown for a month (month is 0-11), each a row of seven ISO dates starting on Sunday. Leading and
 * trailing days come from the neighbouring months so every row is full.
 */
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7)
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => toISO(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d))),
  )
}

/** The same day shifted by n days (negative goes back). */
export function addDays(iso: string, n: number): string {
  const d = parseDate(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** The first day of the month n months away from the one containing iso. */
export function addMonths(iso: string, n: number): string {
  const d = parseDate(iso)
  return toISO(new Date(d.getFullYear(), d.getMonth() + n, 1))
}

// ─── iCalendar export (RFC 5545) ─────────────────────────────────────────────

const KIND_LABEL: Record<CalendarEventKind, string> = {
  application: 'Application deadline',
  report: 'Report due',
  other: 'Grant deadline',
  opportunity: 'Funding opportunity',
  period: 'Grant period',
}

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const compactDate = (iso: string) => iso.replace(/-/g, '')

/** Fold content lines longer than 75 octets, as the spec requires, without splitting a character. */
function fold(line: string): string {
  const enc = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    // Continuation lines start with a space, which counts toward their 75.
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += n
  }
  parts.push(current)
  return parts.join('\r\n ')
}

/**
 * An .ics file of all-day events that Google Calendar, Outlook, Apple Calendar and any iCal-compatible app can
 * import. Open deadlines carry a reminder a week ahead; completed ones are marked as such.
 */
export function toICS(events: CalendarEvent[], { calendarName, stamp = new Date() }: { calendarName: string; stamp?: Date }): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grantit//Grant calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ]
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id.replace(/[^\w.:-]/g, '-')}@grantit`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compactDate(e.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(e.date, 1))}`,
      `SUMMARY:${escapeText(`${e.done ? '✓ ' : ''}${e.title} · ${e.context}`)}`,
      `DESCRIPTION:${escapeText(`${KIND_LABEL[e.kind]} for ${e.context}.${e.done ? ' Completed.' : ''}`)}`,
      `CATEGORIES:${escapeText(KIND_LABEL[e.kind])}`,
      'TRANSP:TRANSPARENT',
    )
    if (!e.done && e.kind !== 'period') {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(`${e.title} in one week`)}`, 'TRIGGER:-P7D', 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
