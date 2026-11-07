import clsx from 'clsx'
import { type ButtonHTMLAttributes, type ReactNode } from 'react'

// ─── Buttons (HubSpot: orange primary, outlined secondary, slate tertiary) ───
// Primary uses --color-accent so white labels keep 4.5:1 contrast; a press state comes from active:.

type Variant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover border border-accent hover:border-accent-hover',
  secondary: 'bg-surface text-brand-dark border border-accent hover:bg-brand-soft',
  tertiary: 'bg-obsidian-2 text-white border border-obsidian-2 hover:bg-obsidian',
  ghost: 'bg-transparent text-link hover:bg-link-soft border border-transparent',
  danger: 'bg-surface text-bad border border-bad/50 hover:bg-bad-soft',
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
        'inline-flex items-center justify-center gap-1.5 rounded-[3px] font-medium transition-colors whitespace-nowrap active:brightness-95',
        'disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link',
        size === 'sm' ? 'h-8 px-3 text-[0.8125rem] pointer-coarse:h-11' : 'h-10 px-4 text-sm pointer-coarse:h-11',
        VARIANTS[variant],
        className,
      )}
    >
      {icon}
      {rest.children}
    </button>
  )
}
