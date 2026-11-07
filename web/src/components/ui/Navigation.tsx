import clsx from 'clsx'
import { type KeyboardEvent, type ReactNode } from 'react'

/** One Tab stop per group; arrow keys wrap, Home/End jump to an edge. */
function moveInGroup(e: KeyboardEvent<HTMLDivElement>) {
  const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
  const current = buttons.indexOf(e.target as HTMLButtonElement)
  if (current < 0) return
  let next: number
  switch (e.key) {
    case 'ArrowRight': next = (current + 1) % buttons.length; break
    case 'ArrowLeft': next = (current - 1 + buttons.length) % buttons.length; break
    case 'Home': next = 0; break
    case 'End': next = buttons.length - 1; break
    default: return
  }
  e.preventDefault()
  buttons[next].focus()
  buttons[next].click()
}

export function Tabs<T extends string>({ id, label, tabs, value, onChange }: { id: string; label: string; tabs: { id: T; label: ReactNode; badge?: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-line-2" role="tablist" aria-label={label} onKeyDown={moveInGroup}>
      {tabs.map((t) => (
        <button
          type="button"
          key={t.id}
          id={`${id}-${t.id}-tab`}
          role="tab"
          aria-controls={`${id}-${t.id}-panel`}
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          className={clsx(
            '-mb-px flex items-center gap-2 border-b-[3px] px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors',
            value === t.id ? 'border-brand text-slate' : 'border-transparent text-slate-2 hover:text-slate',
          )}
        >
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  )
}

/** A single-choice segmented control with a named group and announced selection. */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} onKeyDown={moveInGroup} className="inline-flex max-w-full flex-wrap rounded-2xl bg-canvas-2 p-0.5">
      {options.map((o) => (
        <button
          type="button"
          key={o.id}
          aria-pressed={value === o.id}
          tabIndex={value === o.id ? 0 : -1}
          onClick={() => onChange(o.id)}
          className={clsx(
            'flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition',
            value === o.id ? 'bg-surface text-slate shadow-sm' : 'text-slate-2 hover:text-slate',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
