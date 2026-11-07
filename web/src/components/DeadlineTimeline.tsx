import clsx from 'clsx'
import { FileText, FileBarChart2, CalendarClock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { daysUntil, fmtDate, relativeDay } from '@/lib/format'
import type { TimelineItem } from '@/lib/deadlines'
import { DateTile } from '@/components/ui'

const KIND_ICON = { application: FileText, report: FileBarChart2, other: CalendarClock }

/** Luma-inspired agenda: date tiles on a dotted rail, relative day labels. */
export function DeadlineTimeline({ items, showGrant = true, empty = 'Nothing scheduled' }: { items: TimelineItem[]; showGrant?: boolean; empty?: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-slate-3">{empty}</p>
  return (
    <ol className="relative">
      {items.map(({ deadline: d, grant: g }, i) => {
        const days = daysUntil(d.date)
        const urgent = !d.done && days >= 0 && days <= 14
        const overdue = !d.done && days < 0
        const Icon = KIND_ICON[d.kind]
        return (
          <li key={g.id + d.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 && <span className="absolute left-[21px] top-12 bottom-0 border-l-2 border-dotted border-line" aria-hidden />}
            <DateTile date={d.date} tone={d.done ? 'done' : urgent || overdue ? 'urgent' : 'neutral'} />
            <div className="min-w-0 flex-1 pt-0.5">
              <div className={clsx('text-xs font-medium', overdue ? 'text-bad' : urgent ? 'text-brand-dark' : 'text-slate-3')}>
                {d.done ? 'Completed' : overdue ? `Overdue · ${fmtDate(d.date)}` : relativeDay(d.date)}
              </div>
              <div className={clsx('flex items-center gap-1.5 text-sm font-medium text-slate', d.done && 'line-through opacity-60')}>
                <Icon size={14} className="shrink-0 text-slate-3" />
                <span className="truncate">{d.label}</span>
              </div>
              {showGrant && (
                <Link to={`/grants/${g.id}`} className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-2 hover:text-link">
                  <span className={clsx('h-3 w-3 shrink-0 rounded', `cover-${g.cover}`)} />
                  <span className="truncate">{g.name}</span>
                </Link>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
