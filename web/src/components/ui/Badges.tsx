import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, AlertOctagon, Info } from 'lucide-react'
import { type ReactNode } from 'react'
import { parseDate } from '@grantit/shared/format'

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
