import { CalendarClock, Gauge, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useFunds } from './useFunds'

function ActionCard({ to, icon, label, count, done, todo }: { to: string; icon: ReactNode; label: string; count: number; done: string; todo: string }) {
  return (
    <Link to={to} className="group block rounded-lg border border-line-2 bg-surface p-4 hover:border-line hover:bg-canvas">
      <div className="flex items-center gap-2 text-[0.8125rem] text-slate-2">{icon}{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums text-slate">{count}</div>
      <div className="mt-1 text-xs text-link group-hover:underline">{count ? todo : done}</div>
    </Link>
  )
}

/** The three things a grant bookkeeper acts on, each opening the filtered view that fixes it. */
export function ActionCards({ className }: { className?: string }) {
  const { queue, offPace, dueSoon } = useFunds()
  return (
    <div className={className ?? 'grid grid-cols-1 gap-3 sm:grid-cols-3'}>
      <ActionCard to="/funds/spending" icon={<Inbox size={15} />} label="Expenses to review" count={queue.count} todo="Open the review inbox →" done="Inbox is clear" />
      <ActionCard to="/funds?status=off-pace" icon={<Gauge size={15} />} label="Grants off pace" count={offPace.length} todo="See which grants →" done="All grants on pace" />
      <ActionCard to="/funds/reports" icon={<CalendarClock size={15} />} label="Reports due in 30 days" count={dueSoon.length} todo="Go to reports →" done="Nothing due soon" />
    </div>
  )
}
