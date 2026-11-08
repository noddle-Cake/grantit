import { useMemo } from 'react'
import { todayISO } from '@grantit/shared/format'
import { dueReports, fundingState, grantIssues, isOffPace, pacing, reviewQueue } from '@grantit/shared/funds'
import { useStore } from '@/store'

/**
 * Everything the finance screens act on, from the shared rules in shared/src/funds.ts, so Funded grants, the home
 * page, the sidebar badge and Reports always show the same counts.
 */
export function useFunds() {
  const { state } = useStore()
  const today = todayISO()
  return useMemo(() => {
    const rows = state.grants
      .filter((g) => fundingState(g, today) !== undefined)
      .map((grant) => ({ grant, pace: pacing(grant, state.transactions, today), issues: grantIssues(grant, state.transactions, today) }))
    const queue = reviewQueue(state.grants, state.transactions, today)
    const due = dueReports(state.grants, today)
    return {
      today,
      rows,
      queue,
      due,
      offPace: rows.filter((r) => isOffPace(r.pace)),
      dueSoon: due.filter((d) => d.daysLeft <= 30),
    }
  }, [state.grants, state.transactions, today])
}
