import clsx from 'clsx'
import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Compass, Download, FileBarChart2, FileText, Flag, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { addDays, addMonths, calendarEvents, eventsByDay, monthGrid, sortEvents, toICS, type CalendarEventKind } from '@grantit/shared/calendar'
import { daysUntil, fmtDate, parseDate, relativeDay, todayISO } from '@grantit/shared/format'
import { Button, Card, DateTile, PageHeader, Segmented } from '@/components/ui'
import { externalEvents, providerById, readConnections, writeConnections, type CalendarConnection, type CalendarProviderId } from '@/lib/calendar-connections'
import { useStore } from '@/store'
import { ConnectedCalendars } from './ConnectedCalendars'

type ItemKind = CalendarEventKind | 'external'

/** One row on the calendar: a Grantit event or a meeting from a connected calendar. */
interface Item {
  id: string
  date: string
  title: string
  context?: string
  kind: ItemKind
  done?: boolean
  time?: string
  to?: string
  cover?: number
  provider?: CalendarProviderId
}

const KINDS: { id: ItemKind; label: string; icon: LucideIcon; chip: string; swatch: string }[] = [
  { id: 'application', label: 'Applications', icon: FileText, chip: 'bg-brand-soft text-brand-dark', swatch: 'bg-brand' },
  { id: 'report', label: 'Reports', icon: FileBarChart2, chip: 'bg-link-soft text-link', swatch: 'bg-link' },
  { id: 'other', label: 'Other deadlines', icon: CalendarClock, chip: 'bg-canvas-2 text-slate-2', swatch: 'bg-slate-3' },
  { id: 'period', label: 'Grant periods', icon: Flag, chip: 'bg-good-soft text-good', swatch: 'bg-good' },
  { id: 'opportunity', label: 'Opportunities', icon: Compass, chip: 'border border-dashed border-control-line bg-surface text-slate-2', swatch: 'border border-dashed border-control-line' },
  { id: 'external', label: 'Your calendars', icon: CalendarDays, chip: 'bg-canvas text-slate-2 ring-1 ring-inset ring-line', swatch: 'ring-1 ring-inset ring-control-line' },
]
const kindMeta = (k: ItemKind) => KINDS.find((x) => x.id === k)!

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_CHIPS = 3

/** Calendar: every grant deadline, award period end and open opportunity on a month grid, plus connected calendars. */
export default function CalendarPage() {
  const { state, opportunities, dismissedOpportunities, notify } = useStore()
  const today = todayISO()
  const [view, setView] = useState<'month' | 'agenda'>('month')
  const [selected, setSelected] = useState(today)
  const [cursor, setCursor] = useState(() => addMonths(today, 0))
  const [hidden, setHidden] = useState<Set<ItemKind>>(new Set())
  const [connections, setConnections] = useState<CalendarConnection[]>(readConnections)

  const saveConnections = (next: CalendarConnection[]) => {
    setConnections(next)
    writeConnections(next)
  }

  const grantEvents = useMemo(
    () => calendarEvents(state.grants, opportunities, { today, dismissed: dismissedOpportunities }),
    [state.grants, opportunities, dismissedOpportunities, today],
  )
  const items: Item[] = useMemo(() => {
    const own: Item[] = grantEvents.map((e) => ({
      ...e,
      to: e.grantId ? `/grants/${e.grantId}` : '/apply',
    }))
    const theirs: Item[] = externalEvents(connections, today).map((e) => ({ ...e, kind: 'external', context: providerById(e.provider).name }))
    return sortEvents([...own, ...theirs]).filter((i) => !hidden.has(i.kind))
  }, [grantEvents, connections, today, hidden])
  const byDay = useMemo(() => eventsByDay(items), [items])

  const cursorDate = parseDate(cursor)
  const monthLabel = cursorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const goTo = (iso: string) => {
    setSelected(iso)
    setCursor(addMonths(iso, 0))
  }

  // Deep links like /calendar?date=2026-03-15 (e.g. from the dashboard's Upcoming list) select that day.
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  useEffect(() => {
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) goTo(dateParam)
  }, [dateParam])

  const exportICS = () => {
    const events = grantEvents.filter((e) => !hidden.has(e.kind))
    const blob = new Blob([toICS(events, { calendarName: `${state.org.name} grant deadlines` })], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: 'grantit-deadlines.ics' })
    a.click()
    URL.revokeObjectURL(url)
    notify(`Exported ${events.length} event${events.length === 1 ? '' : 's'}. Open the file to add them to any calendar app.`)
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Application deadlines, reports and award periods in one place, synced to the calendars your team already uses."
        actions={
          <>
            <Segmented label="Calendar view" value={view} onChange={setView} options={[{ id: 'month', label: 'Month' }, { id: 'agenda', label: 'Agenda' }]} />
            <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={exportICS}>Export .ics</Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <Legend hidden={hidden} onToggle={(k) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n })} hasExternal={connections.some((c) => c.showTheirEvents)} />
          {view === 'month' ? (
            <section aria-label={`${monthLabel} calendar`} className="overflow-hidden rounded-lg border border-line-2 bg-surface">
              <header className="flex flex-wrap items-center gap-2 border-b border-line-2 px-4 py-3">
                <h2 className="mr-auto text-lg font-semibold text-slate" aria-live="polite">{monthLabel}</h2>
                <Button variant="ghost" size="sm" onClick={() => goTo(today)}>Today</Button>
                <button type="button" aria-label="Previous month" onClick={() => goTo(addMonths(cursor, -1))} className="flex h-8 w-8 items-center justify-center rounded text-slate-2 hover:bg-canvas-2 pointer-coarse:h-11 pointer-coarse:w-11"><ChevronLeft size={18} /></button>
                <button type="button" aria-label="Next month" onClick={() => goTo(addMonths(cursor, 1))} className="flex h-8 w-8 items-center justify-center rounded text-slate-2 hover:bg-canvas-2 pointer-coarse:h-11 pointer-coarse:w-11"><ChevronRight size={18} /></button>
              </header>
              <MonthGrid year={cursorDate.getFullYear()} month={cursorDate.getMonth()} today={today} selected={selected} byDay={byDay} onSelect={setSelected} onNavigate={goTo} />
            </section>
          ) : (
            <Agenda items={items} today={today} />
          )}
        </div>

        <div className="space-y-6">
          {view === 'month' && <DayDetail date={selected} items={byDay.get(selected) ?? []} />}
          <ConnectedCalendars connections={connections} onChange={saveConnections} onExport={exportICS} />
        </div>
      </div>
    </>
  )
}

function Legend({ hidden, onToggle, hasExternal }: { hidden: Set<ItemKind>; onToggle: (k: ItemKind) => void; hasExternal: boolean }) {
  return (
    <div role="group" aria-label="Show on calendar" className="flex flex-wrap gap-2">
      {KINDS.filter((k) => k.id !== 'external' || hasExternal).map((k) => (
        <button
          type="button"
          key={k.id}
          aria-pressed={!hidden.has(k.id)}
          onClick={() => onToggle(k.id)}
          className={clsx(
            'flex min-h-8 items-center gap-2 rounded-full border px-3 py-1 text-[0.8125rem] font-medium transition-colors',
            hidden.has(k.id) ? 'border-line-2 text-slate-3 line-through' : 'border-line text-slate hover:bg-canvas-2',
          )}
        >
          <span className={clsx('h-2.5 w-2.5 rounded-sm', k.swatch, hidden.has(k.id) && 'opacity-40')} aria-hidden />
          {k.label}
        </button>
      ))}
    </div>
  )
}

function Chip({ item }: { item: Item }) {
  const k = kindMeta(item.kind)
  const body = (
    <>
      {item.kind === 'external' && item.provider ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: providerById(item.provider).color }} aria-hidden />
      ) : item.cover !== undefined ? (
        <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', `cover-${item.cover}`)} aria-hidden />
      ) : null}
      {item.time && <span className="shrink-0 tabular-nums opacity-80">{item.time}</span>}
      <span className="truncate">{item.title}</span>
    </>
  )
  const cls = clsx('flex w-full min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-left text-[0.6875rem] font-medium leading-4', k.chip, item.done && 'line-through opacity-60')
  const label = `${k.label.replace(/s$/, '')}: ${item.title}${item.context ? `, ${item.context}` : ''}`
  return item.to ? (
    <Link to={item.to} title={label} aria-label={label} className={clsx(cls, 'hover:brightness-95')} onClick={(e) => e.stopPropagation()}>{body}</Link>
  ) : (
    <span title={label} className={cls}>{body}</span>
  )
}

function MonthGrid({ year, month, today, selected, byDay, onSelect, onNavigate }: {
  year: number; month: number; today: string; selected: string; byDay: Map<string, Item[]>; onSelect: (iso: string) => void; onNavigate: (iso: string) => void
}) {
  const weeks = useMemo(() => monthGrid(year, month), [year, month])
  const grid = useRef<HTMLTableElement>(null)
  const moved = useRef(false)
  const visible = weeks.flat()
  // The focusable day: the selected one when it's on screen, else the 1st of the month.
  const focusDay = visible.includes(selected) ? selected : weeks.flat().find((d) => parseDate(d).getMonth() === month)!

  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${selected}"]`)?.focus()
  }, [selected, year, month])

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    let next: string | undefined
    if (e.key in step) next = addDays(focusDay, step[e.key])
    else if (e.key === 'Home') next = addDays(focusDay, -parseDate(focusDay).getDay())
    else if (e.key === 'End') next = addDays(focusDay, 6 - parseDate(focusDay).getDay())
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      const d = parseDate(focusDay)
      const target = new Date(d.getFullYear(), d.getMonth() + (e.key === 'PageUp' ? -1 : 1), 1)
      const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
      next = addDays(addMonths(focusDay, e.key === 'PageUp' ? -1 : 1), Math.min(d.getDate(), last) - 1)
    }
    if (!next) return
    e.preventDefault()
    moved.current = true
    if (visible.includes(next) && parseDate(next).getMonth() === month) onSelect(next)
    else onNavigate(next)
  }

  return (
    <table ref={grid} role="grid" aria-label="Month" onKeyDown={onKeyDown} className="w-full table-fixed border-collapse">
      <thead>
        <tr>
          {WEEKDAYS.map((d) => (
            <th key={d} scope="col" className="border-b border-line-2 py-2 text-center text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-3">
              <abbr title={d} className="no-underline"><span className="sm:hidden">{d[0]}</span><span className="hidden sm:inline">{d}</span></abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((day) => {
              const d = parseDate(day)
              const inMonth = d.getMonth() === month
              const events = byDay.get(day) ?? []
              const isToday = day === today
              const isSelected = day === selected
              const label = `${fmtDate(day, { weekday: 'long', month: 'long', day: 'numeric' })}${isToday ? ', today' : ''}, ${events.length ? `${events.length} event${events.length === 1 ? '' : 's'}` : 'no events'}`
              return (
                <td
                  key={day}
                  role="gridcell"
                  aria-selected={isSelected}
                  onClick={() => (inMonth ? onSelect(day) : onNavigate(day))}
                  className={clsx(
                    'h-16 cursor-pointer border-b border-r border-line-2 p-1 align-top last:border-r-0 sm:h-28 sm:p-1.5',
                    !inMonth && 'bg-canvas',
                    isSelected && 'bg-link-soft/60',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      data-date={day}
                      tabIndex={day === focusDay ? 0 : -1}
                      aria-label={label}
                      aria-current={isToday ? 'date' : undefined}
                      onClick={(e) => { e.stopPropagation(); if (inMonth) onSelect(day); else onNavigate(day) }}
                      className={clsx(
                        'flex h-7 w-7 items-center justify-center rounded-full text-[0.8125rem] tabular-nums',
                        isToday ? 'bg-accent font-semibold text-white' : inMonth ? 'text-slate hover:bg-canvas-2' : 'text-slate-3 hover:bg-canvas-2',
                        isSelected && !isToday && 'ring-2 ring-link',
                      )}
                    >
                      {d.getDate()}
                    </button>
                  </div>
                  {/* Phones: a dot per event; the day panel lists them. */}
                  {events.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-0.5 px-0.5 sm:hidden" aria-hidden>
                      {events.slice(0, 4).map((e) => <span key={e.id} className={clsx('h-1.5 w-1.5 rounded-full', kindMeta(e.kind).swatch)} />)}
                    </div>
                  )}
                  <div className={clsx('mt-1 hidden space-y-0.5 sm:block', !inMonth && 'opacity-70')}>
                    {events.slice(0, MAX_CHIPS).map((e) => <Chip key={e.id} item={e} />)}
                    {events.length > MAX_CHIPS && (
                      <button type="button" tabIndex={-1} onClick={(ev) => { ev.stopPropagation(); onSelect(day) }} className="px-1.5 text-[0.6875rem] font-medium text-link hover:underline">
                        +{events.length - MAX_CHIPS} more
                      </button>
                    )}
                  </div>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ItemRow({ item }: { item: Item }) {
  const k = kindMeta(item.kind)
  const Icon = k.icon
  return (
    <li className="flex gap-3 py-2.5">
      <span className={clsx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md', k.chip)}><Icon size={14} /></span>
      <div className="min-w-0 flex-1">
        <div className={clsx('text-sm font-medium text-slate', item.done && 'line-through opacity-60')}>
          {item.to ? <Link to={item.to} className="hover:text-link hover:underline">{item.title}</Link> : item.title}
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-3">
          {item.provider && <span className="h-2 w-2 rounded-full" style={{ background: providerById(item.provider).color }} aria-hidden />}
          {item.time && <span className="tabular-nums">{item.time}</span>}
          {item.time && item.context && <span aria-hidden>·</span>}
          {item.context && <span className="truncate">{item.context}</span>}
          {item.done && <span>· Completed</span>}
        </div>
      </div>
    </li>
  )
}

function DayDetail({ date, items }: { date: string; items: Item[] }) {
  return (
    <Card title={fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' })} action={<span className="text-xs text-slate-3">{relativeDay(date)}</span>}>
      {items.length ? (
        <ul className="-my-2.5 divide-y divide-line-2">{items.map((i) => <ItemRow key={i.id} item={i} />)}</ul>
      ) : (
        <p className="text-sm text-slate-3">Nothing on this day.</p>
      )}
    </Card>
  )
}

function Agenda({ items, today }: { items: Item[]; today: string }) {
  const overdue = items.filter((i) => i.date < today && !i.done && i.kind !== 'external' && i.kind !== 'period')
  const upcoming = items.filter((i) => i.date >= today)
  const months = new Map<string, Item[]>()
  for (const i of upcoming) {
    const key = i.date.slice(0, 7)
    months.set(key, [...(months.get(key) ?? []), i])
  }
  const groups: [string, Item[]][] = [...(overdue.length ? [['Overdue', overdue] as [string, Item[]]] : []), ...[...months].map(([m, list]) => [parseDate(`${m}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), list] as [string, Item[]])]

  if (!groups.length) return <Card><p className="py-6 text-center text-sm text-slate-3">Nothing coming up.</p></Card>
  return (
    <div className="space-y-4">
      {groups.map(([heading, list]) => (
        <Card key={heading} title={<span className={heading === 'Overdue' ? 'text-bad' : undefined}>{heading}</span>} padded={false}>
          <ol className="divide-y divide-line-2">
            {list.map((i) => {
              const days = daysUntil(i.date)
              const urgent = !i.done && i.kind !== 'external' && days <= 14
              return (
                <li key={i.id} className="flex items-start gap-3 px-5 py-1">
                  <div className="pt-2.5"><DateTile date={i.date} tone={i.done ? 'done' : urgent ? 'urgent' : 'neutral'} /></div>
                  <ul className="min-w-0 flex-1"><ItemRow item={i} /></ul>
                  <span className={clsx('shrink-0 pt-3.5 text-xs', days < 0 ? 'text-bad' : 'text-slate-3')}>{relativeDay(i.date)}</span>
                </li>
              )
            })}
          </ol>
        </Card>
      ))}
    </div>
  )
}
