import clsx from 'clsx'
import { type ReactNode } from 'react'

// ─── Tabs (HubSpot record tabs: underline, orange active) ───────────────────

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; badge?: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-line-2" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
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

/** Luma-style segmented control. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full bg-canvas-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={clsx(
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition',
            value === o.id ? 'bg-surface text-slate shadow-sm' : 'text-slate-2 hover:text-slate',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
