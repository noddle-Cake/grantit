// Calendar connections (preview). Connecting is simulated: nothing leaves the browser, and the "events from your
// calendar" are sample meetings generated around today. The choices are kept in this browser's localStorage, outside
// the app state, so "Reset demo data" leaves them alone. A real integration would swap connect() for an OAuth flow
// (Google, Microsoft) or a published iCal feed (Apple, everything else) run by the API.

import { toISO } from '@grantit/shared/format'
import { addDays } from '@grantit/shared/calendar'

export const CALENDAR_CONNECTIONS_KEY = 'grantit:calendar-connections:v1'

export type CalendarProviderId = 'google' | 'outlook' | 'apple' | 'ical'

export interface CalendarProvider {
  id: CalendarProviderId
  name: string
  /** Why non-profits use it, shown under the name. */
  blurb: string
  /** OAuth providers sync both ways; feed providers subscribe to Grantit's iCal link. */
  method: 'oauth' | 'feed'
  /** Brand colour, used only as a small decorative swatch beside the name. */
  color: string
  accountHint: string
}

export const CALENDAR_PROVIDERS: CalendarProvider[] = [
  { id: 'google', name: 'Google Calendar', blurb: 'Google Workspace for Nonprofits', method: 'oauth', color: '#1a73e8', accountHint: 'you@yourorg.org' },
  { id: 'outlook', name: 'Microsoft Outlook', blurb: 'Microsoft 365 Business Premium for nonprofits', method: 'oauth', color: '#0f6cbd', accountHint: 'you@yourorg.onmicrosoft.com' },
  { id: 'apple', name: 'Apple Calendar', blurb: 'iCloud on Mac, iPhone and iPad', method: 'feed', color: '#e5484d', accountHint: '' },
  { id: 'ical', name: 'Other calendar apps', blurb: 'Zoho, Fastmail, Proton, Thunderbird or any iCal app', method: 'feed', color: '#6b7f94', accountHint: '' },
]

export const providerById = (id: CalendarProviderId) => CALENDAR_PROVIDERS.find((p) => p.id === id)!

export interface CalendarConnection {
  provider: CalendarProviderId
  /** Signed-in account (OAuth providers only). */
  account?: string
  /** Which calendar Grantit writes to. */
  target: 'new' | 'primary'
  includeOpportunities: boolean
  /** Show the organization's own meetings from this calendar alongside grant deadlines. */
  showTheirEvents: boolean
  connectedAt: string
  lastSyncedAt: string
}

export function readConnections(): CalendarConnection[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CALENDAR_CONNECTIONS_KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter((c): c is CalendarConnection => !!c && CALENDAR_PROVIDERS.some((p) => p.id === (c as CalendarConnection).provider)) : []
  } catch {
    return []
  }
}

export function writeConnections(list: CalendarConnection[]) {
  try {
    localStorage.setItem(CALENDAR_CONNECTIONS_KEY, JSON.stringify(list))
  } catch {
    // Storage blocked: the connection still shows for this page view.
  }
}

/** The subscription link a feed provider would add. A placeholder until the API publishes real feeds. */
export function feedUrl(orgName: string) {
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org'
  return `webcal://app.grantit.org/calendar/${slug}/deadlines.ics`
}

// ─── Sample events "from" a connected calendar ───────────────────────────────

export interface ExternalEvent {
  id: string
  date: string
  time?: string
  title: string
  provider: CalendarProviderId
}

// Typical non-profit meetings, placed relative to today so the preview always has something nearby.
const SAMPLES: { offset: number; time?: string; title: string }[] = [
  { offset: -6, time: '10:00', title: 'Program team standup' },
  { offset: -2, time: '18:00', title: 'Volunteer orientation' },
  { offset: 2, time: '09:30', title: 'Grant writing work session' },
  { offset: 5, time: '17:30', title: 'Board of directors meeting' },
  { offset: 9, time: '14:00', title: 'Funder site visit' },
  { offset: 13, title: 'Annual appeal mailing' },
  { offset: 16, time: '12:00', title: 'Finance committee' },
  { offset: 23, time: '11:00', title: 'Program officer check-in' },
  { offset: 30, title: 'Community fundraiser' },
  { offset: 37, time: '17:30', title: 'Board of directors meeting' },
]

/** Sample meetings from each connected calendar that shows its events; spread so two calendars don't duplicate. */
export function externalEvents(connections: CalendarConnection[], today = toISO(new Date())): ExternalEvent[] {
  const showing = connections.filter((c) => c.showTheirEvents)
  return showing.flatMap((c, ci) =>
    SAMPLES.flatMap((s, i) =>
      i % showing.length === ci ? [{ id: `${c.provider}:${i}`, date: addDays(today, s.offset), time: s.time, title: s.title, provider: c.provider }] : [],
    ),
  )
}
