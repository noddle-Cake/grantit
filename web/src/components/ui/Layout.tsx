import clsx from 'clsx'
import { type ReactNode } from 'react'

// ─── Surfaces ───────────────────────────────────────────────────────────────

export function Card({ className, children, title, action, padded = true }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode; padded?: boolean }) {
  return (
    <section className={clsx('rounded-lg border border-line-2 bg-surface', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-2 px-5 py-3.5">
          <h3 className="text-[0.9375rem] font-semibold text-slate">{title}</h3>
          {action}
        </header>
      )}
      <div className={clsx(padded && 'p-5')}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-5">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-3">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold text-slate">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-canvas-2 text-slate-2">{icon}</div>
      <h4 className="text-[0.9375rem] font-semibold text-slate">{title}</h4>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line-2 bg-surface p-4">
      <div className="flex items-center gap-2 text-[0.8125rem] text-slate-2">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums text-slate">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-3">{sub}</div>}
    </div>
  )
}
