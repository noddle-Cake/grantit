import clsx from 'clsx'
import { X, AlertTriangle, CheckCircle2, AlertOctagon, Info } from 'lucide-react'
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { parseDate } from '../lib/format'

// ─── Buttons (HubSpot: orange primary, outlined secondary, slate tertiary) ───

type Variant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark border border-brand hover:border-brand-dark',
  secondary: 'bg-white text-brand-dark border border-brand hover:bg-brand-soft',
  tertiary: 'bg-obsidian-2 text-white border border-obsidian-2 hover:bg-obsidian',
  ghost: 'bg-transparent text-link hover:bg-link-soft border border-transparent',
  danger: 'bg-white text-bad border border-bad/50 hover:bg-bad-soft',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  icon,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-[3px] font-medium transition-colors whitespace-nowrap',
        'disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {icon}
      {rest.children}
    </button>
  )
}

export function IconButton({ label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      className={clsx('inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-2 hover:bg-canvas-2 hover:text-slate', className)}
    />
  )
}

// ─── Surfaces ───────────────────────────────────────────────────────────────

export function Card({ className, children, title, action, padded = true }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode; padded?: boolean }) {
  return (
    <section className={clsx('rounded-lg border border-line-2 bg-white', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line-2 px-5 py-3.5">
          <h3 className="text-[15px] font-semibold text-slate">{title}</h3>
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

// ─── Chips & badges (Luma-like pills) ───────────────────────────────────────

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'brand'
const TONES: Record<Tone, string> = {
  neutral: 'bg-canvas-2 text-slate-2',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn ring-1 ring-inset ring-[#f5c26b]/50',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-link-soft text-link',
  brand: 'bg-brand-soft text-brand-dark',
}

export function Pill({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

const STATUS_ICON = { good: CheckCircle2, warn: AlertTriangle, bad: AlertOctagon, info: Info }
/** Status always ships with icon + label, never colour alone. */
export function StatusPill({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  const I = STATUS_ICON[tone]
  return (
    <Pill tone={tone}>
      <I size={12} strokeWidth={2.5} />
      {children}
    </Pill>
  )
}

export function Avatar({ initials, size = 28, className }: { initials: string; size?: number; className?: string }) {
  const hues = ['#ff7a59', '#00a38d', '#2a78d6', '#6250d6', '#eda100']
  const bg = hues[initials.charCodeAt(0) % hues.length]
  return (
    <span
      className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  )
}

// ─── Luma-style date tile ───────────────────────────────────────────────────

export function DateTile({ date, tone = 'neutral' }: { date: string; tone?: 'neutral' | 'urgent' | 'done' }) {
  const d = parseDate(date)
  return (
    <div
      className={clsx(
        'flex h-12 w-11 shrink-0 flex-col overflow-hidden rounded-lg border text-center',
        tone === 'urgent' ? 'border-brand/50' : 'border-line-2',
        tone === 'done' && 'opacity-55',
      )}
    >
      <div className={clsx('py-px text-[9px] font-semibold uppercase tracking-wider', tone === 'urgent' ? 'bg-brand text-white' : 'bg-canvas-2 text-slate-2')}>
        {d.toLocaleDateString('en-US', { month: 'short' })}
      </div>
      <div className="flex flex-1 items-center justify-center bg-white text-lg font-semibold leading-none text-slate">{d.getDate()}</div>
    </div>
  )
}

// ─── Progress / meter ───────────────────────────────────────────────────────

export function Meter({ value, max, className, height = 8 }: { value: number; max: number; className?: string; height?: number }) {
  const ratio = max > 0 ? value / max : 0
  const color = ratio > 1 ? 'var(--color-bad)' : ratio >= 0.85 ? '#eda100' : 'var(--color-viz-1)'
  return (
    <div className={clsx('w-full overflow-hidden rounded-full bg-viz-track', className)} style={{ height }} role="meter" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(ratio, 1) * 100}%`, background: color }} />
    </div>
  )
}

// ─── Form controls ──────────────────────────────────────────────────────────

const field =
  'w-full rounded-[3px] border border-line bg-canvas px-3 py-2 text-sm text-slate placeholder:text-slate-3 focus:border-link focus:bg-white focus:outline-none focus:ring-2 focus:ring-link/20'

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={clsx(field, 'h-10', p.className)} />
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={clsx(field, 'leading-relaxed', p.className)} />
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={clsx(field, 'h-10 pr-8', p.className)} />

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-slate">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-3">{hint}</span>}
    </label>
  )
}

// ─── Overlays ───────────────────────────────────────────────────────────────

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}

/** HubSpot-style right side panel with navy header. */
export function Drawer({ open, title, onClose, children, footer, width = 480 }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEscape(onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-obsidian/40" onClick={onClose} />
      <aside className="animate-slide-in relative flex h-full max-w-full flex-col bg-white shadow-2xl" style={{ width }}>
        <header className="flex items-center justify-between bg-obsidian-2 px-6 py-4 text-white">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-white/10">
            <X size={18} />
          </button>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-6">{children}</div>
        {footer && <footer className="flex gap-2 border-t border-line-2 bg-canvas px-6 py-4">{footer}</footer>}
      </aside>
    </div>
  )
}

/** Luma-style centered modal: rounded, airy, soft shadow. */
export function Modal({ open, onClose, children, width = 560 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  useEscape(onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh]">
      <div className="absolute inset-0 bg-obsidian/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-pop-in relative w-full overflow-hidden rounded-2xl bg-white shadow-2xl" style={{ maxWidth: width }}>
        {children}
      </div>
    </div>
  )
}

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
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition',
            value === o.id ? 'bg-white text-slate shadow-sm' : 'text-slate-2 hover:text-slate',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-canvas-2 text-slate-2">{icon}</div>
      <h4 className="text-[15px] font-semibold text-slate">{title}</h4>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line-2 bg-white p-4">
      <div className="flex items-center gap-2 text-[13px] text-slate-2">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums text-slate">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-3">{sub}</div>}
    </div>
  )
}
