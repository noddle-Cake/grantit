import clsx from 'clsx'
import { BookOpenText, Check, ChevronDown, ChevronsLeft, ChevronsRight, Compass, FileBarChart2, FileText, HandCoins, Home, Menu, Receipt, Search, Settings, Users, CheckCircle2, AlertOctagon, Info } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { matchPath, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { todayISO } from '@grantit/shared/format'
import { recommendOpportunities } from '@grantit/shared/opportunities'
import { ROLE_LABEL, ROLE_SUMMARY } from '@grantit/shared/permissions'
import { workspaceOf } from '@grantit/shared/workspaces'
import { WORKSPACES } from '@/lib/labels'
import { useStore } from '@/store'
import { Logo } from '@/components/Logo'
import { Avatar } from '@/components/ui'

// Two workspaces: finding and applying for funding, and managing money that was awarded.
const NAV: { heading?: string; items: { to: string; label: string; icon: typeof Home; end?: boolean }[] }[] = [
  { items: [{ to: '/', label: 'Home', icon: Home, end: true }] },
  {
    heading: WORKSPACES.apply.label,
    items: [
      { to: '/apply', label: 'Opportunities', icon: Compass, end: true },
      { to: '/apply/applications', label: 'Applications', icon: FileText },
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

function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onCloseMobile: () => void }) {
  const { state, flags, opportunities, dismissedOpportunities } = useStore()
  const { pathname } = useLocation()
  const pendingFacts = state.facts.filter((f) => f.status === 'pending').length
  const flagged = [...flags.values()].filter((f) => f.length).length
  const recommended = useMemo(
    () => recommendOpportunities(opportunities, state.facts, state.grants, { today: todayISO(), dismissed: dismissedOpportunities }).length,
    [opportunities, state.facts, state.grants, dismissedOpportunities],
  )
  const badges: Record<string, number> = { '/apply': recommended, '/apply/knowledge': pendingFacts, '/funds/spending': flagged }

  // A grant's record page belongs to the workspace for its stage, so highlight that workspace's list.
  const grantId = matchPath('/grants/:id', pathname)?.params.id
  const recordGrant = grantId ? state.grants.find((g) => g.id === grantId) : undefined
  const activeOverride = recordGrant ? WORKSPACES[workspaceOf(recordGrant.stage)].home : undefined

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-obsidian/50 lg:hidden" onClick={onCloseMobile} />}
      <nav
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex flex-col bg-obsidian py-4 transition-[width,transform] duration-200 lg:static lg:translate-x-0',
          collapsed ? 'w-[68px]' : 'w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-6 px-4">
          <Logo collapsed={collapsed} />
        </div>
        <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-2.5">
          {NAV.map((group, gi) => (
          <div key={group.heading ?? gi}>
          {group.heading &&
            (collapsed ? (
              <div className="mx-3 mb-2 border-t border-white/10" />
            ) : (
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#7f95a8]">{group.heading}</div>
            ))}
          <ul className="space-y-0.5">
          {group.items.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={onCloseMobile}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  clsx(
                    'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] transition-colors',
                    isActive || to === activeOverride ? 'bg-white/12 text-white' : 'text-[#b6c7d6] hover:bg-white/6 hover:text-white',
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
                        <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-[18px] text-white">{badges[to]}</span>
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
            className={({ isActive }) => clsx('flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px]', isActive ? 'bg-white/12 text-white' : 'text-[#b6c7d6] hover:bg-white/6 hover:text-white')}
          >
            <Settings size={18} strokeWidth={1.8} />
            {!collapsed && 'Settings'}
          </NavLink>
          <button onClick={onToggle} className="mt-1 hidden w-full items-center gap-3 rounded-md px-3 py-2.5 text-[13px] text-[#b6c7d6] hover:bg-white/6 hover:text-white lg:flex">
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
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-canvas-2">
        <Avatar initials={me.initials} size={30} />
        <div className="hidden text-left leading-tight sm:block">
          <div className="text-[13px] font-medium text-slate">{me.name}</div>
          <div className="text-[11px] text-slate-3">{ROLE_LABEL[me.role]}</div>
        </div>
        <ChevronDown size={14} className="text-slate-3" />
      </button>
      {open && (
        <div className="animate-pop-in absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-line-2 bg-white shadow-xl">
          <div className="border-b border-line-2 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-3">Switch user (demo)</div>
          {state.users.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                setCurrentUser(u.id)
                setOpen(false)
                notify(`Now viewing as ${u.name} · ${ROLE_LABEL[u.role]}`, 'info')
              }}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-canvas"
            >
              <Avatar initials={u.initials} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate">{u.name}</div>
                <div className="text-xs text-slate-2">{u.title}</div>
                <div className="mt-0.5 text-[11px] text-slate-3">{ROLE_SUMMARY[u.role]}</div>
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
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)
  const term = q.trim().toLowerCase()
  const results = term
    ? [
        ...state.grants.filter((g) => (g.name + g.funder).toLowerCase().includes(term)).map((g) => ({ kind: 'Grant', label: g.name, sub: g.funder, to: `/grants/${g.id}` })),
        ...state.facts.filter((f) => (f.title + f.content).toLowerCase().includes(term)).map((f) => ({ kind: 'Fact', label: f.title, sub: f.content, to: `/apply/knowledge?fact=${f.id}` })),
      ].slice(0, 7)
    : []

  return (
    <div className="relative w-full max-w-md">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-3" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        placeholder="Search grants, funders, facts…"
        className="h-9 w-full rounded-full border border-line-2 bg-canvas pl-9 pr-3 text-sm placeholder:text-slate-3 focus:border-link focus:bg-white focus:outline-none"
      />
      {focus && results.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-line-2 bg-white shadow-xl">
          {results.map((r) => (
            <button
              key={r.to}
              onMouseDown={() => {
                nav(r.to)
                setQ('')
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-canvas"
            >
              <span className="w-10 shrink-0 text-[11px] font-medium uppercase text-slate-3">{r.kind}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-slate">{r.label}</span>
                <span className="block truncate text-xs text-slate-3">{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Toasts() {
  const { toasts } = useStore()
  const icon = { success: CheckCircle2, info: Info, error: AlertOctagon }
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => {
        const I = icon[t.tone ?? 'success']
        return (
          <div key={t.id} className="animate-pop-in flex items-center gap-2 rounded-full bg-obsidian px-4 py-2.5 text-sm text-white shadow-lg">
            <I size={16} className={t.tone === 'error' ? 'text-[#ff8f96]' : t.tone === 'info' ? 'text-[#7fd3e6]' : 'text-[#5fe0c8]'} />
            {t.message}
          </div>
        )
      })}
    </div>
  )
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { state } = useStore()
  const loc = useLocation()
  useEffect(() => {
    document.querySelector('main')?.scrollTo(0, 0)
  }, [loc.pathname])

  return (
    <div className="flex h-full">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line-2 bg-white px-4 lg:px-6">
          <button className="rounded p-1.5 text-slate-2 hover:bg-canvas-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-[13px] text-slate-3 md:inline">{state.org.name}</span>
            <UserMenu />
          </div>
        </header>
        <main className="scrollbar-thin flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1360px] px-4 py-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
      <Toasts />
    </div>
  )
}
