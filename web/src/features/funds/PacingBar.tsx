import { isOffPace, type Pacing } from '@grantit/shared/funds'

/** Spend so far (fill) against time gone in the grant's own period (the "today" tick). */
export function PacingBar({ pace }: { pace: Pacing }) {
  const spent = Math.min(pace.spentPct, 1)
  // Amber only when the grant needs attention (off pace, or unspent money while closing out).
  const color = pace.spentPct > 1 ? 'var(--color-bad)' : isOffPace(pace) ? 'var(--color-viz-warn)' : 'var(--color-viz-1)'
  const caption = `${Math.round(pace.spentPct * 100)}% spent · ${Math.round(pace.elapsedPct * 100)}% of period gone`
  return (
    <div className="min-w-0">
      <div
        className="relative h-2 w-full rounded-full bg-viz-track"
        role="img"
        aria-label={caption}
      >
        <div className="h-full rounded-full" style={{ width: `${spent * 100}%`, background: color }} />
        <div className="absolute -top-1 h-4 w-0.5 rounded bg-slate" style={{ left: `calc(${pace.elapsedPct * 100}% - 1px)` }} title="Today" />
      </div>
      <div className="mt-1.5 text-xs tabular-nums text-slate-2">{caption}</div>
    </div>
  )
}
