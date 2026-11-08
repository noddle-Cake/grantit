import clsx from 'clsx'
import { BookOpenText, CalendarDays, Check, ChevronDown, ChevronsLeft, ChevronsRight, Compass, FileBarChart2, FileText, HandCoins, Home, Menu, Receipt, Search, Settings, Users, CheckCircle2, AlertOctagon, Info, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { matchPath, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { todayISO } from '@grantit/shared/format'
import { isAtRisk } from '@grantit/shared/applications'
import { ROLE_LABEL, ROLE_SUMMARY } from '@grantit/shared/permissions'
import { workspaceOf } from '@grantit/shared/workspaces'
import { WORKSPACES } from '@/lib/labels'
import { useStore } from '@/store'
import { useFunds } from '@/features/funds/useFunds'
import { Logo } from '@/components/Logo'
import { Avatar, Dialog } from '@/components/ui'

// Two workspaces: finding and applying for funding, and managing money that was awarded.
const NAV: { heading?: string; items: { to: string; label: string; icon: typeof Home; end?: boolean }[] }[] = [
  {
    items: [
      { to: '/', label: 'Home', icon: Home, end: true },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    heading: WORKSPACES.apply.label,
    items: [
      { to: '/apply/applications', label: 'Applications', icon: FileText },
      { to: '/apply', label: 'Opportunities', icon: Compass, end: true },
      { to: '/apply/knowledge', label: 'Knowledge base', icon: BookOpenText },
    ],
  },
  {
    heading: WORKSPACES.funds.label,
    items: [
      { to: '/funds', label: 'Funded grants', icon: HandCoins, end: true },
      { to: '/funds/spending', label: 'Spending', icon: Receipt },
      { to: '/funds/reports', label: 'Reports', icon: FileBarChart2 },
    ],
  },
  { items: [{ to: '/team', label: 'Team & roles', icon: Users }] },
]

function Sidebar({ collapsed, onToggle, onCloseMobile, mobile = false }: { collapsed: boolean; onToggle: () => void; onCloseMobile: () => void; mobile?: boolean }) {
  const { state } = useStore()
  const { pathname } = useLocation()
  const pendingFacts = state.facts.filter((f) => f.status === 'pending').length
  const toReview = useFunds().queue.count
  // Badge what needs action, not what's merely available: applications due soon that aren't ready.
  const atRisk = useMemo(() => {
    const today = todayISO()
    return state.grants.filter((g) => isAtRisk(g, state.facts, today)).length
  }, [state.grants, state.facts])
  const badges: Record<string, number> = { '/apply/applications': atRisk, '/apply/knowledge': pendingFacts, '/funds/spending': toReview }

  // A grant's record page belongs to the workspace for its stage, so highlight that workspace's list.
  const grantId = matchPath('/grants/:id', pathname)?.params.id
  const recordGrant = grantId ? state.grants.find((g) => g.id === grantId) : undefined
  const activeOverride = recordGrant ? workspaceOf(recordGrant.stage) === 'apply' ? '/apply/applications' : '/funds' : undefined

  return (
    <>
      <nav
        aria-label="Main navigation"
        className={clsx(
          'h-full shrink-0 flex-col bg-obsidian py-4 transition-[width] duration-200',
          mobile ? 'flex max-w-full' : 'hidden lg:flex',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
      >
        <div className="mb-6 flex items-center justify-between gap-3 px-4">
          <div className="flex items-center px-1">
            <Logo collapsed={collapsed} onDark />
          </div>
          {mobile && <button type="button" onClick={onCloseMobile} aria-label="Close navigation" className="flex h-8 w-8 items-center justify-center rounded text-white hover:bg-white/10"><X size={18} /></button>}
        </div>
        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-2.5">
          {NAV.map((group, gi) => (
          <div key={group.heading ?? gi}>
          {group.heading &&
            (collapsed ? (
              <div className="mx-3 mb-2 border-t border-white/10" />
            ) : (
              <div className="px-3 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-rail-muted">{group.heading}</div>
            ))}
          <ul className="space-y-0.5">
          {group.items.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={onCloseMobile}
                title={collapsed ? label : undefined}
                aria-label={collapsed ? label : undefined}
                className={({ isActive }) =>
                  clsx(
                    'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[0.875rem] transition-colors',
                    isActive || to === activeOverride ? 'bg-white/12 text-white' : 'text-rail-text hover:bg-white/6 hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {(isActive || to === activeOverride) && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-brand" />}
                    <Icon size={18} strokeWidth={1.8} className="shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{label}</span>}
                    {badges[to] > 0 &&
                      (collapsed ? (
                        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand" />
                      ) : (
                        <span className="rounded-full bg-accent px-1.5 text-[0.6875rem] font-semibold leading-[1.125rem] text-white">{badges[to]}</span>
                      ))}
                  </>
                )}
              </NavLink>
            </li>
          ))}
          </ul>
          </div>
          ))}
        </div>
        <div className="px-2.5">
          <NavLink
            to="/settings"
            onClick={onCloseMobile}
            aria-label={collapsed ? 'Settings' : undefined}
            className={({ isActive }) => clsx('flex items-center gap-3 rounded-md px-3 py-2.5 text-[0.875rem]', isActive ? 'bg-white/12 text-white' : 'text-rail-text hover:bg-white/6 hover:text-white')}
          >
            <Settings size={18} strokeWidth={1.8} />
            {!collapsed && 'Settings'}
          </NavLink>
          <button onClick={onToggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed} className="mt-1 hidden w-full items-center gap-3 rounded-md px-3 py-2.5 text-[0.8125rem] text-rail-text hover:bg-white/6 hover:text-white lg:flex">
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            {!collapsed && 'Collapse'}
          </button>
        </div>
      </nav>
    </>
  )
}

function UserMenu() {
  const { state, me, setCurrentUser, notify } = useStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="relative" ref={ref} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }} onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus() } }}>
      <button ref={trigger} aria-label={`Switch user, current user ${me.name}`} aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-canvas-2">
        <Avatar initials={me.initials} size={30} />
        <div className="hidden text-left leading-tight sm:block">
          <div className="text-[0.8125rem] font-medium text-slate">{me.name}</div>
          <div className="text-[0.6875rem] text-slate-3">{ROLE_LABEL[me.role]}</div>
        </div>
        <ChevronDown size={14} className="text-slate-3" />
      </button>
      {open && (
        <div id={menuId} role="group" aria-label="Switch user (demo)" className="animate-pop-in absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line-2 bg-surface shadow-xl">
          <div className="border-b border-line-2 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-3">Switch user (demo)</div>
          {state.users.map((u) => (
            <button
              key={u.id}
              aria-pressed={u.id === me.id}
              onClick={() => {
                setCurrentUser(u.id)
                setOpen(false)
                trigger.current?.focus()
                notify(`Now viewing as ${u.name} · ${ROLE_LABEL[u.role]}`, 'info')
              }}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-canvas"
            >
              <Avatar initials={u.initials} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate">{u.name}</div>
                <div className="text-xs text-slate-2">{u.title}</div>
                <div className="mt-0.5 text-[0.6875rem] text-slate-3">{ROLE_SUMMARY[u.role]}</div>
              </div>
              {u.id === me.id && <Check size={16} className="mt-1 text-good" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function GlobalSearch() {
  const { state } = useStore()
  const nav = useNavigate()
  const resultsId = useId()
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)
  const [active, setActive] = useState(-1)
  const term = q.trim().toLowerCase()
  const results = term
    ? [
        ...state.grants.filter((g) => (g.name + g.funder).toLowerCase().includes(term)).map((g) => ({ kind: 'Grant', label: g.name, sub: g.funder, to: `/grants/${g.id}` })),
        ...state.facts.filter((f) => (f.title + f.content).toLowerCase().includes(term)).map((f) => ({ kind: 'Fact', label: f.title, sub: f.content, to: `/apply/knowledge?fact=${f.id}` })),
      ].slice(0, 7)
    : []
  const expanded = focus && results.length > 0
  const choose = (to: string) => {
    setQ('')
    setFocus(false)
    setActive(-1)
    nav(to)
  }

  return (
    <div className="relative w-full min-w-0 max-w-md">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-3" />
      <input
        role="combobox"
        aria-label="Search grants, funders, and facts"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? resultsId : undefined}
        aria-activedescendant={expanded && results[active] ? `${resultsId}-${active}` : undefined}
        value={q}
        onChange={(e) => { setQ(e.target.value); setActive(-1); setFocus(true) }}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); setActive(-1) }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setFocus(false); setActive(-1) }
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && results.length) {
            e.preventDefault()
            setFocus(true)
            setActive((a) => e.key === 'ArrowDown' ? (a + 1) % results.length : (a <= 0 ? results.length : a) - 1)
          }
          if (e.key === 'Enter' && expanded && results[active]) {
            e.preventDefault()
            choose(results[active].to)
          }
        }}
        placeholder="Search grants, funders, facts…"
        className="h-9 w-full rounded-full border border-control-line bg-canvas pl-9 pr-3 text-sm placeholder:text-slate-3 focus:border-link focus:bg-surface"
      />
      <span role="status" className="sr-only">{focus && term ? `${results.length} results${results.length ? '. Use the up and down arrow keys to choose a result.' : '. Try a different search.'}` : ''}</span>
      {expanded && (
        <div id={resultsId} role="listbox" aria-label="Search results" className="absolute left-0 right-0 z-50 mt-2 max-h-[60dvh] overflow-y-auto rounded-xl border border-line-2 bg-surface shadow-xl">
          {results.map((r, i) => (
            <button
              type="button"
              key={r.to}
              id={`${resultsId}-${i}`}
              role="option"
              aria-selected={active === i}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(r.to)}
              className={clsx('flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-canvas', active === i && 'bg-canvas-2')}
            >
              <span className="w-10 shrink-0 text-[0.6875rem] font-medium uppercase text-slate-3">{r.kind}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-slate">{r.label}</span>
                <span className="block truncate text-xs text-slate-3">{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {focus && term && !results.length && <div className="absolute left-0 right-0 z-50 mt-2 rounded-xl border border-line-2 bg-surface p-4 text-sm text-slate-2 shadow-xl">No results. Try another grant, funder, or fact.</div>}
    </div>
  )
}

function Toasts() {
  const { toasts, dismissToast } = useStore()
  const icon = { success: CheckCircle2, info: Info, error: AlertOctagon }
  return (
    // A polite live region so screen readers announce confirmations without interrupting.
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex max-h-[40dvh] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2 overflow-y-auto">
      {toasts.map((t) => {
        const I = icon[t.tone ?? 'success']
        return (
          <div key={t.id} className="animate-pop-in flex max-w-full shrink-0 items-center gap-2 rounded-xl bg-obsidian px-4 py-2.5 text-sm text-white shadow-lg">
            {/* The toast is always dark, so these tints read in both appearances. */}
            <I size={16} aria-hidden="true" className={t.tone === 'error' ? 'text-[#ff8f96]' : t.tone === 'info' ? 'text-[#7fd3e6]' : 'text-[#5fe0c8]'} />
            <span className="min-w-0 break-words">{t.message}</span>
            {t.action && (
              <>
              <button
                onClick={() => {
                  t.action!.run()
                  dismissToast(t.id)
                }}
                className="pointer-events-auto -my-1 ml-1 rounded-full px-2.5 py-1 font-semibold text-[#7fd3e6] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
              >
                {t.action.label}
              </button>
              <button onClick={() => dismissToast(t.id)} aria-label={`Dismiss notification: ${t.message}`} className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-white"><X size={14} /></button>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function AppShell({ children }: { children?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { state } = useStore()
  const loc = useLocation()
  const previousPath = useRef(loc.pathname)
  useEffect(() => {
    const main = document.querySelector('main')
    main?.scrollTo(0, 0)
    if (previousPath.current !== loc.pathname) main?.focus()
    previousPath.current = loc.pathname
  }, [loc.pathname])
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 64rem)')
    const closeOnDesktop = () => { if (wide.matches) setMobileOpen(false) }
    wide.addEventListener('change', closeOnDesktop)
    return () => wide.removeEventListener('change', closeOnDesktop)
  }, [])

  return (
    <div className="flex h-full">
      <a href="#main-content" className="fixed left-4 top-2 z-[70] -translate-y-24 rounded bg-surface px-4 py-3 text-link shadow focus:translate-y-0">Skip to content</a>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} onCloseMobile={() => setMobileOpen(false)} />
      <Dialog open={mobileOpen} onClose={() => setMobileOpen(false)} label="Navigation" className="justify-start p-0">
        <Sidebar mobile collapsed={false} onToggle={() => {}} onCloseMobile={() => setMobileOpen(false)} />
      </Dialog>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line-2 bg-surface px-4 lg:px-6">
          <button className="rounded p-1.5 text-slate-2 hover:bg-canvas-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen}>
            <Menu size={20} />
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-[0.8125rem] text-slate-3 md:inline">{state.org.name}</span>
            <UserMenu />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="scrollbar-thin flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1360px] px-4 py-6 lg:px-8">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
      <Toasts />
    </div>
  )
}
