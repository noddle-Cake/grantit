const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usdCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })

export const money = (n: number) => usd.format(n)
export const moneyExact = (n: number) => usdCents.format(n)
export const moneyCompact = (n: number) => compact.format(n)
export const pct = (n: number) => `${Math.round(n * 100)}%`

/** Parse an ISO date (YYYY-MM-DD) as a local date, avoiding UTC off-by-one. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const todayISO = () => toISO(new Date())

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return parseDate(iso).toLocaleDateString('en-US', opts)
}

export function daysUntil(iso: string): number {
  const now = parseDate(todayISO())
  return Math.round((parseDate(iso).getTime() - now.getTime()) / 86_400_000)
}

/** Luma-style relative label: "Today", "Tomorrow", "In 5 days", "3 days ago". */
export function relativeDay(iso: string): string {
  const d = daysUntil(iso)
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d === -1) return 'Yesterday'
  if (d > 1 && d < 45) return `In ${d} days`
  if (d < -1 && d > -45) return `${-d} days ago`
  return fmtDate(iso)
}

export function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

export const uid = (prefix = 'id') => `${prefix}-${Math.random().toString(36).slice(2, 9)}`
