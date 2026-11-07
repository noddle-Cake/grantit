import type { Deadline, Grant } from '@/types'

export interface TimelineItem {
  deadline: Deadline
  grant: Grant
}

export function collectDeadlines(grants: Grant[], { includeDone = false } = {}): TimelineItem[] {
  return grants
    .flatMap((g) => g.deadlines.map((d) => ({ deadline: d, grant: g })))
    .filter((x) => includeDone || !x.deadline.done)
    .sort((a, b) => a.deadline.date.localeCompare(b.deadline.date))
}
