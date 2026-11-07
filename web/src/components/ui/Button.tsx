import clsx from 'clsx'
import { type ButtonHTMLAttributes, type ReactNode } from 'react'

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
