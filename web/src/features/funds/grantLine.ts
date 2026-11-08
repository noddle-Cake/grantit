import { fmtDate } from '@grantit/shared/format'
import type { Pacing } from '@grantit/shared/funds'
import type { Grant } from '@grantit/shared/types'

/** "Jan–Dec 2026" or "Oct 2025–Sep 2026". */
export function periodShort(g: Grant) {
  const s = fmtDate(g.periodStart, { month: 'short', year: 'numeric' }).split(' ')
  const e = fmtDate(g.periodEnd, { month: 'short', year: 'numeric' }).split(' ')
  return s[1] === e[1] ? `${s[0]}–${e[0]} ${e[1]}` : `${s.join(' ')}–${e.join(' ')}`
}

const timeLeft = (days: number) => (days < 14 ? `${days} day${days === 1 ? '' : 's'} left` : `${Math.floor(days / 7)} weeks left`)

/** One line under the grant name: its period plus what's next for it. */
export function grantLine(g: Grant, pace: Pacing) {
  const fr = pace.finalReport
  switch (pace.state) {
    case 'closing-out': {
      const report = !fr ? 'no final report deadline set' : fr.daysLeft >= 0 ? `report due in ${fr.daysLeft} day${fr.daysLeft === 1 ? '' : 's'}` : `report overdue by ${-fr.daysLeft} days`
      return `Ended ${fmtDate(g.periodEnd, { month: 'short', day: 'numeric' })} · ${report}`
    }
    case 'closed':
      return `${periodShort(g)} · final report submitted`
    case 'needs-setup':
      return `${periodShort(g)} · budget not set up`
    default:
      return `${periodShort(g)} · ${pace.daysLeft >= 0 ? timeLeft(pace.daysLeft) : 'ended'}`
  }
}
