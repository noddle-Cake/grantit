import { BookOpenText, Check, FileText, PenLine, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FACT_CATEGORIES, FACT_STATUS, factCategoryLabel } from '@/lib/labels'
import { Avatar, Button, Card, EmptyState, PageHeader, Pill, Segmented } from '@/components/ui'
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
  const gaps = FACT_CATEGORIES.filter((c) => !state.facts.some((f) => f.category === c.id && f.status === 'approved'))

  return (
    <>
      <PageHeader
        eyebrow="Find & apply"
        title="Knowledge base"
        subtitle="The single source of truth for applications. Only approved facts are used in drafts."
        actions={can(me.role, 'fact:edit') && <Button icon={<Plus size={16} />} onClick={() => setOpen('new')}>Add fact</Button>}
      />

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-60">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-3" />
            <input aria-label="Search facts" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search facts" className="h-9 w-full rounded-lg border border-control-line bg-surface pl-9 pr-3 text-sm placeholder:text-slate-3 focus:border-link" />
          </div>
          <Segmented<StatusFilter>
            label="Fact status"
            value={status}
            onChange={setStatus}
            options={[
              { id: 'all', label: `All ${state.facts.length}` },
              { id: 'pending', label: `Needs approval ${counts('pending')}` },
              { id: 'draft', label: `Draft ${counts('draft')}` },
              { id: 'approved', label: `Approved ${counts('approved')}` },
            ]}
          />
          <select aria-label="Fact category" value={cat} onChange={(e) => setCat(e.target.value as FactCategory | 'all')} className="h-9 max-w-full rounded-lg border border-control-line bg-surface px-3 text-sm text-slate">
            <option value="all">All categories</option>
            {FACT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
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
                      <button onClick={() => setOpen(f)} className="flex items-center gap-1 text-xs text-slate-3 opacity-100 transition hover:text-link"><PenLine size={12} /> Edit</button>
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

      {gaps.length > 0 && <details className="mt-4 rounded-lg border border-line-2 bg-surface px-5 py-3">
        <summary className="cursor-pointer text-sm font-medium text-slate">Review {gaps.length} information gap{gaps.length === 1 ? '' : 's'}</summary>
        <p className="mt-2 text-xs text-slate-2">These categories have no approved facts for drafts.</p>
        <ul className="mt-3 space-y-2">
          {gaps.map((g) => <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-2">{g.label}</span>
            {can(me.role, 'fact:edit') && <button onClick={() => { setHint(g.label.toLowerCase()); setOpen('new') }} className="text-xs font-medium text-link hover:underline">Add fact</button>}
          </li>)}
        </ul>
      </details>}

      {open && <FactDrawer key={open === 'new' ? 'new' : open.id} fact={open} hint={hint} onClose={close} />}
    </>
  )
}
