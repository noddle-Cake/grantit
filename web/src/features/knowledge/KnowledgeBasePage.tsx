import clsx from 'clsx'
import { BookOpenText, Check, FileText, PenLine, Plus, Search, Sparkles, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FACT_CATEGORIES, FACT_STATUS, factCategoryLabel } from '@/lib/labels'
import { Avatar, Button, Card, EmptyState, PageHeader, Pill, Segmented, StatusPill } from '@/components/ui'
import { relativeDay } from '@grantit/shared/format'
import { can, canApproveFact } from '@grantit/shared/permissions'
import { useStore } from '@/store'
import type { Fact, FactCategory, FactStatus } from '@grantit/shared/types'
import { FactDrawer } from './FactDrawer'

type StatusFilter = 'all' | FactStatus

export default function KnowledgeBase() {
  const { state, me, setFactStatus, notify } = useStore()
  const [params, setParams] = useSearchParams()
  const [cat, setCat] = useState<FactCategory | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>((params.get('status') as StatusFilter) ?? 'all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Fact | 'new' | null>(null)
  const [hint, setHint] = useState<string>()

  useEffect(() => {
    const fid = params.get('fact')
    if (fid) setOpen(state.facts.find((f) => f.id === fid) ?? null)
    if (params.get('new')) {
      setHint(params.get('hint') ?? undefined)
      setOpen('new')
    }
    // only react to URL changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const close = () => {
    setOpen(null)
    setHint(undefined)
    if (params.has('fact') || params.has('new')) setParams({})
  }

  const facts = useMemo(
    () =>
      state.facts
        .filter((f) => cat === 'all' || f.category === cat)
        .filter((f) => status === 'all' || f.status === status)
        .filter((f) => (f.title + f.content + f.tags.join(' ')).toLowerCase().includes(q.toLowerCase())),
    [state.facts, cat, status, q],
  )
  const counts = (s: FactStatus) => state.facts.filter((f) => f.status === s).length
  const coverage = FACT_CATEGORIES.map((c) => ({ ...c, n: state.facts.filter((f) => f.category === c.id && f.status === 'approved').length }))
  const gaps = coverage.filter((c) => c.n === 0)

  return (
    <>
      <PageHeader
        title="Knowledge base"
        subtitle="The single source of truth for applications. Only approved facts are used in drafts."
        actions={can(me.role, 'fact:edit') && <Button icon={<Plus size={16} />} onClick={() => setOpen('new')}>Add fact</Button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {coverage.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(cat === c.id ? 'all' : c.id)}
            className={clsx(
              'rounded-lg border bg-white px-3 py-2.5 text-left transition',
              cat === c.id ? 'border-link ring-2 ring-link/15' : 'border-line-2 hover:border-line',
            )}
          >
            <div className="text-xs text-slate-2">{c.label}</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-lg font-semibold tabular-nums text-slate">{c.n}</span>
              {c.n === 0 ? <StatusPill tone="warn">Gap</StatusPill> : <span className="text-[11px] text-slate-3">approved</span>}
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search facts" className="h-9 w-60 rounded-[3px] border border-line bg-white pl-9 pr-3 text-sm focus:border-link focus:outline-none" />
            </div>
            <Segmented<StatusFilter>
              value={status}
              onChange={setStatus}
              options={[
                { id: 'all', label: `All ${state.facts.length}` },
                { id: 'pending', label: `Needs approval ${counts('pending')}` },
                { id: 'draft', label: `Draft ${counts('draft')}` },
                { id: 'approved', label: `Approved ${counts('approved')}` },
              ]}
            />
            {cat !== 'all' && (
              <button onClick={() => setCat('all')} className="flex items-center gap-1 rounded-full bg-obsidian-2 px-3 py-1 text-xs text-white">
                {factCategoryLabel(cat)} <X size={12} />
              </button>
            )}
          </div>

          <Card padded={false}>
            {facts.length ? (
              <ul className="divide-y divide-line-2">
                {facts.map((f) => {
                  const author = state.users.find((u) => u.id === f.updatedBy)
                  return (
                    <li key={f.id} className="group flex gap-4 px-5 py-4 hover:bg-canvas">
                      <button onClick={() => setOpen(f)} className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-link group-hover:underline">{f.title}</span>
                          <Pill>{factCategoryLabel(f.category)}</Pill>
                          <Pill tone={FACT_STATUS[f.status].tone} dot>{FACT_STATUS[f.status].label}</Pill>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-2">{f.content}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-3">
                          {author && <span className="flex items-center gap-1.5"><Avatar initials={author.initials} size={16} /> {author.name}</span>}
                          <span>Updated {relativeDay(f.updatedAt)}</span>
                          {f.source && <span className="flex items-center gap-1"><FileText size={11} /> {f.source}</span>}
                        </div>
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {f.status !== 'approved' && canApproveFact(me.role, f.category) && (
                          <Button size="sm" variant="secondary" icon={<Check size={14} />} onClick={() => { setFactStatus(f.id, 'approved'); notify(`Approved “${f.title}”`) }}>Approve</Button>
                        )}
                        {f.status === 'draft' && !canApproveFact(me.role, f.category) && can(me.role, 'fact:edit') && (
                          <Button size="sm" variant="ghost" onClick={() => { setFactStatus(f.id, 'pending'); notify('Submitted for approval') }}>Submit</Button>
                        )}
                        <button onClick={() => setOpen(f)} className="flex items-center gap-1 text-xs text-slate-3 opacity-0 transition group-hover:opacity-100 hover:text-link"><PenLine size={12} /> Edit</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState icon={<BookOpenText />} title="No facts match" action={<Button size="sm" variant="secondary" onClick={() => { setQ(''); setStatus('all'); setCat('all') }}>Clear filters</Button>}>
                Try a different search or category.
              </EmptyState>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {gaps.length > 0 && (
            <Card title="Information gaps">
              <p className="text-sm text-slate-2">Drafts will flag these as missing rather than inventing content:</p>
              <ul className="mt-3 space-y-2">
                {gaps.map((g) => (
                  <li key={g.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate">{g.label}</span>
                    {can(me.role, 'fact:edit') && <button onClick={() => { setHint(g.label.toLowerCase()); setOpen('new') }} className="text-xs font-medium text-link hover:underline">Add fact</button>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Writing style" action={<Pill tone="info"><Sparkles size={11} /> Learned</Pill>}>
            <p className="text-sm text-slate-2">From {state.documents.filter((d) => d.outcome === 'awarded').length} awarded applications.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['Warm, community-first', 'Data-led openings', 'Plain language', 'Active voice', '~21 words / sentence'].map((t) => (
                <span key={t} className="rounded-full border border-line-2 bg-canvas px-2.5 py-1 text-xs text-slate">{t}</span>
              ))}
            </div>
          </Card>

          <Card title="Past applications & reports" action={can(me.role, 'fact:edit') && <button className="flex items-center gap-1 text-xs font-medium text-link hover:underline" onClick={() => notify('Document upload will be available once storage is connected', 'info')}><Upload size={12} /> Upload</button>} padded={false}>
            <ul className="divide-y divide-line-2">
              {state.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-canvas-2 text-slate-2"><FileText size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate">{d.name}</div>
                    <div className="text-xs text-slate-3">{d.year} · {d.kind === 'application' ? 'Application' : 'Report'}</div>
                  </div>
                  {d.outcome && <Pill tone={d.outcome === 'awarded' ? 'good' : d.outcome === 'declined' ? 'bad' : 'info'}>{d.outcome}</Pill>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {open && <FactDrawer key={open === 'new' ? 'new' : open.id} fact={open} hint={hint} onClose={close} />}
    </>
  )
}
