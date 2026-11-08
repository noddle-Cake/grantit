/**
 * Grantit logo. Expanded, it is the "GrantIt" wordmark (public/logo.svg, public/logo-dark.svg).
 * Collapsed, it is the square mark: three rising bars (funding that grows), last one in brand orange.
 *
 * `onDark` is for surfaces that stay navy in both themes, like the sidebar. Otherwise the navy
 * wordmark shows in the light theme and the white one in the dark theme.
 */
export function Logo({ collapsed = false, onDark = false, className = 'h-6' }: { collapsed?: boolean; onDark?: boolean; className?: string }) {
  if (collapsed) {
    return (
      <div className="flex items-center px-1">
        <svg width="28" height="28" viewBox="0 0 32 32" role="img" aria-label="Grantit">
          <rect width="32" height="32" rx="8" fill="#2e475d" />
          <rect x="7" y="17" width="4.5" height="8" rx="1.5" fill="#fff" opacity=".55" />
          <rect x="13.75" y="12" width="4.5" height="13" rx="1.5" fill="#fff" opacity=".85" />
          <rect x="20.5" y="7" width="4.5" height="18" rx="1.5" fill="#FF7A59" />
        </svg>
      </div>
    )
  }
  if (onDark) return <img src="/logo-dark.svg" alt="Grantit" className={`w-auto ${className}`} />
  return (
    <>
      <img src="/logo.svg" alt="Grantit" className={`theme-light-only w-auto ${className}`} />
      <img src="/logo-dark.svg" alt="Grantit" className={`theme-dark-only w-auto ${className}`} />
    </>
  )
}
