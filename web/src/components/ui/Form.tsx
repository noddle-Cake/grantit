import clsx from 'clsx'
import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

// ─── Form controls ──────────────────────────────────────────────────────────

const field =
  'w-full rounded-[3px] border border-control-line bg-canvas px-3 py-2 text-sm text-slate placeholder:text-slate-3 focus:border-link focus:bg-surface focus:ring-2 focus:ring-link/20'

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={clsx(field, 'h-10', p.className)} />
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={clsx(field, 'leading-relaxed', p.className)} />
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={clsx(field, 'h-10 pr-8', p.className)} />

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  const generatedId = useId()
  const control = isValidElement<{ id?: string; 'aria-describedby'?: string }>(children) ? children : null
  const id = control?.props.id ?? generatedId
  const hintId = `${id}-hint`
  return (
    <div className={clsx('block', className)}>
      <label htmlFor={id} className="mb-1.5 block text-[0.8125rem] font-medium text-slate">{label}</label>
      {control ? cloneElement(control, { id, 'aria-describedby': [control.props['aria-describedby'], hint ? hintId : null].filter(Boolean).join(' ') || undefined }) : children}
      {hint && <div id={hintId} className="mt-1 text-xs text-slate-3">{hint}</div>}
    </div>
  )
}
