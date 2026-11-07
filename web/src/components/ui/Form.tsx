import clsx from 'clsx'
import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

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
