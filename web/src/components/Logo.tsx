/** Grantit mark: three rising bars (funding that grows), last one in brand orange. */
export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#2e475d" />
        <rect x="7" y="17" width="4.5" height="8" rx="1.5" fill="#fff" opacity=".55" />
        <rect x="13.75" y="12" width="4.5" height="13" rx="1.5" fill="#fff" opacity=".85" />
        <rect x="20.5" y="7" width="4.5" height="18" rx="1.5" fill="#FF7A59" />
      </svg>
      {!collapsed && <span className="text-[17px] font-semibold tracking-tight text-white">Grantit</span>}
    </div>
  )
}
