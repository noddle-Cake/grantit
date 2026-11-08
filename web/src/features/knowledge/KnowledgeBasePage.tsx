import { BookOpenText, Check, FileText, PenLine, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FACT_CATEGORIES, FACT_STATUS, factCategoryLabel } from '@/lib/labels'
import { Avatar, Button, Card, EmptyState, Pill, Segmented } from '@/components/ui'
import { byImpact, factImpact, impactOf, isStale, type FactImpact } from '@grantit/shared/fact-impact'
import { relativeDay, todayISO } from '@grantit/shared/format'
import { recommendOpportunities } from '@grantit/shared/opportunities'
import { can, canApproveFact } from '@grantit/shared/permissions'
import { useStore } from '@/store'
import type { Fact, FactCategory, FactStatus } from '@grantit/shared/types'
import { FactDrawer } from './FactDrawer'
import { NeededNow } from './NeededNow'

type StatusFilter = 'all' | FactStatus

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "Unblocks 1 application · Strengthens 2 matches · Used in 3 answers", most decisive first. */
function impactText(i: FactImpact, approved: boolean) {
  return [
    i.unblocks && `Unblocks ${count(i.unblocks, 'application')}`,
    i.recommendations && `${approved ? 'Backs' : 'Strengthens'} ${count(i.recommendations, 'match', 'matches')}`,
    i.answers && `Used in ${count(i.answers, 'answer')}`,
  ].filter(Boolean).join(' · ')
}

function SelectAll({ checked, partial, onChange }: { checked: boolean; partial: boolean; onChange: (on: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = partial }, [partial])
  return (
    <label className="flex items-center gap-2 text-sm text-slate">
      <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> Select all you can approve
    </label>
  )
}

export default function KnowledgeBase() {
  const { state, me, opportunities, dismissedOpportunities, setFactStatus, notify } = useStore()
  const [params, setParams] = useSearchParams()
  // ?category= deep links (e.g. "Review finance facts" on Applications); unknown values fall back to all.
  const [cat, setCat] = useState<FactCategory | 'all'>(() => FACT_CATEGORIES.find((c) => c.id === params.get('category'))?.id ?? 'all')
  // Approvers land on their queue: open on "Needs approval" when something is waiting that they can approve.
  const [status, setStatus] = useState<StatusFilter>(
    () => (params.get('status') as StatusFilter) ?? (state.facts.some((f) => f.status === 'pending' && canApproveFact(me.role, f.category)) ? 'pending' : 'all'),
  )
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Fact | 'new' | null>(null)
  const [hint, setHint] = useState<string>()
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

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

  const impact = useMemo(() => {
    const recs = recommendOpportunities(opportunities, state.facts, state.grants, { today: todayISO(), dismissed: dismissedOpportunities })
    return factImpact(state.grants, state.facts, recs)
  }, [opportunities, state.facts, state.grants, dismissedOpportunities])
  const today = todayISO()

  const facts = useMemo(
    () =>
      state.facts
        .filter((f) => cat === 'all' || f.category === cat)
        .filter((f) => status === 'all' || f.status === status)
        .filter((f) => (f.title + f.content + f.tags.join(' ')).toLowerCase().includes(q.toLowerCase()))
        // In the approval queue, list what this person can approve first (program staff approve program-side
        // facts only), then what each approval is worth.
        .sort((a, b) =>
          status === 'pending'
            ? Number(canApproveFact(me.role, b.category)) - Number(canApproveFact(me.role, a.category)) || byImpact(impactOf(impact, a.id), impactOf(impact, b.id))
            : 0,
        ),
    [state.facts, cat, status, q, me.role, impact],
  )
  const approvable = facts.filter((f) => f.status !== 'approved' && canApproveFact(me.role, f.category))
  const chosen = approvable.filter((f) => selected.has(f.id))
  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })

  function approveChosen() {
    const before = chosen.map((f) => ({ id: f.id, status: f.status }))
    before.forEach((f) => setFactStatus(f.id, 'approved'))
    setSelected(new Set())
    notify(`Approved ${count(before.length, 'fact')}`, 'success', { label: 'Undo', run: () => before.forEach((f) => setFactStatus(f.id, f.status)) })
  }
  const counts = (s: FactStatus) => state.facts.filter((f) => f.status === s).length

  return (
    <>
      {can(me.role, 'fact:edit') && (
        <div className="mb-4 flex justify-end">
          <Button icon={<Plus size={16} />} onClick={() => setOpen('new')}>Add fact</Button>
        </div>
      )}

      <NeededNow onAdd={(h) => { setHint(h); setOpen('new') }} onOpen={setOpen} />

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
          {approvable.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-2 px-5 py-2.5">
              <SelectAll checked={chosen.length === approvable.length} partial={chosen.length > 0 && chosen.length < approvable.length} onChange={(on) => setSelected(new Set(on ? approvable.map((f) => f.id) : []))} />
              <span className="text-xs tabular-nums text-slate-3" aria-live="polite">{chosen.length} selected</span>
              <Button size="sm" className="ml-auto" icon={<Check size={14} />} disabled={!chosen.length} onClick={approveChosen}>
                Approve {chosen.length ? count(chosen.length, 'fact') : 'selected'}
              </Button>
            </div>
          )}
          {facts.length ? (
            <ul aria-label="Facts" className="divide-y divide-line-2">
              {facts.map((f) => {
                const author = state.users.find((u) => u.id === f.updatedBy)
                const canApprove = f.status !== 'approved' && canApproveFact(me.role, f.category)
                const effect = impactText(impactOf(impact, f.id), f.status === 'approved')
                return (
                  <li key={f.id} className="group flex gap-3 px-5 py-4 hover:bg-canvas">
                    {approvable.length > 1 &&
                      (canApprove ? (
                        <label className="-ml-1 flex w-6 shrink-0 items-start justify-center self-start pt-1">
                          <input type="checkbox" aria-label={`Select ${f.title}`} checked={selected.has(f.id)} onChange={(e) => toggle(f.id, e.target.checked)} />
                        </label>
                      ) : (
                        <span aria-hidden className="-ml-1 w-6 shrink-0" />
                      ))}
                    <button onClick={() => setOpen(f)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-link group-hover:underline">{f.title}</span>
                        <Pill>{factCategoryLabel(f.category)}</Pill>
                        <Pill tone={FACT_STATUS[f.status].tone} dot>{FACT_STATUS[f.status].label}</Pill>
                        {isStale(f, today) && <span title="Finance and organization facts should be reviewed every 12 months"><Pill tone="warn">Over a year old</Pill></span>}
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-2">{f.content}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-3">
                        {author && <span className="flex items-center gap-1.5"><Avatar initials={author.initials} size={16} /> {author.name}</span>}
                        <span>Updated {relativeDay(f.updatedAt)}</span>
                        {f.source && <span className="flex items-center gap-1"><FileText size={11} /> {f.source}</span>}
                      </div>
                      {effect && <p className="mt-1 text-xs font-medium text-slate-2">{effect}</p>}
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

      {open && <FactDrawer key={open === 'new' ? 'new' : open.id} fact={open} hint={hint} onClose={close} />}
    </>
  )
}
