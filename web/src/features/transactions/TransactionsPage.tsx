import clsx from 'clsx'
import { Ban, CalendarX2, CheckCheck, CheckCircle2, Circle, Lock, Search, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ImportModal } from './ImportModal'
import { Button, Card, PageHeader, Segmented, Select, StatusPill } from '@/components/ui'
import { allocationCategoryName, FLAG_LABEL, sumDollars } from '@grantit/shared/finance'
import { fmtDate, moneyExact } from '@grantit/shared/format'
import { needsReview } from '@grantit/shared/funds'
import { can } from '@grantit/shared/permissions'
import { isOpenAward } from '@grantit/shared/setup'
import { useFunds } from '@/features/funds/useFunds'
import { useStore } from '@/store'
import type { Transaction } from '@grantit/shared/types'
import { AllocationDrawer } from './AllocationDrawer'

type View = 'to-review' | 'all' | 'not-funded'

/** Spending as an inbox: what needs a decision first, the whole ledger second. */
export default function Transactions() {
  const { state, flags, me, markReviewed, setNotGrantFunded, notify } = useStore()
  const { queue } = useFunds()
  const [params, setParams] = useSearchParams()
  const requestedView = params.get('view')
  // Older links (?view=flagged, unassigned, unreviewed) all land in the review inbox.
  const view: View = requestedView === 'all' || requestedView === 'not-funded' ? requestedView : 'to-review'
  const grantFilter = params.get('grant') ?? 'all'
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openTx, setOpenTx] = useState<Transaction | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const canReview = can(me.role, 'finance:review')
  const grantOptions = state.grants.filter(isOpenAward)

  const setParam = (k: string, v: string, def: string) => {
    const p = new URLSearchParams(params)
    if (v === def) p.delete(k)
    else p.set(k, v)
    setParams(p)
  }

  const rows = useMemo(
    () =>
      state.transactions
        .filter((t) => (view === 'to-review' ? needsReview(t, flags) : view === 'not-funded' ? !!t.notGrantFunded : true))
        .filter((t) => grantFilter === 'all' || t.allocations.some((a) => a.grantId === grantFilter))
        .filter((t) => (t.vendor + t.description + t.account).toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.transactions, flags, view, grantFilter, q],
  )
  const missing = view === 'to-review' && !q ? queue.missing.filter((m) => grantFilter === 'all' || m.grantId === grantFilter) : []
  const grantFor = (id: string) => state.grants.find((g) => g.id === id)
  const grantName = (id: string) => grantFor(id)?.name ?? 'Unknown grant'
  const selectedUnassigned = state.transactions.filter((t) => selected.has(t.id) && !t.allocations.length && !t.notGrantFunded).map((t) => t.id)
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))

  return (
    <>
      <PageHeader
        eyebrow="Manage funds"
        title="Spending"
        subtitle="Assign every expense to the right grant and category. Checks run automatically."
        actions={can(me.role, 'finance:import') && <Button icon={<Upload size={16} />} onClick={() => setImportOpen(true)}>Import</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented<View>
          label="Transaction view"
          value={view}
          onChange={(v) => setParam('view', v, 'to-review')}
          options={[
            { id: 'to-review', label: `To review ${queue.count}` },
            { id: 'all', label: `All ${state.transactions.length}` },
            { id: 'not-funded', label: `Not grant-funded ${state.transactions.filter((t) => t.notGrantFunded).length}` },
          ]}
        />
        <Select aria-label="Filter by grant" value={grantFilter} onChange={(e) => setParam('grant', e.target.value, 'all')} className="!h-9 !w-60 !bg-surface">
          <option value="all">All grants</option>
          {grantOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-3" />
          <input aria-label="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vendor, memo, account" className="h-9 w-56 rounded-[3px] border border-control-line bg-surface pl-9 pr-3 text-sm placeholder:text-slate-3 focus:border-link" />
        </div>
      </div>

      {selected.size > 0 && canReview && (
        <div className="animate-pop-in mb-3 flex items-center gap-3 rounded-lg bg-obsidian-2 px-4 py-2.5 text-sm text-white">
          <span>{selected.size} selected</span>
          <button className="rounded px-2 py-1 font-medium hover:bg-white/10 focus-visible:outline-white" onClick={() => { markReviewed([...selected]); notify(`${selected.size} marked reviewed`); setSelected(new Set()) }}>
            <CheckCheck size={14} className="mr-1 inline" /> Mark reviewed
          </button>
          <button
            className="rounded px-2 py-1 font-medium hover:bg-white/10 focus-visible:outline-white disabled:opacity-50"
            disabled={!selectedUnassigned.length}
            title={selectedUnassigned.length ? undefined : 'Only unassigned transactions can be marked not grant-funded'}
            onClick={() => { setNotGrantFunded(selectedUnassigned, true); notify(`${selectedUnassigned.length} marked not grant-funded`); setSelected(new Set()) }}
          >
            <Ban size={14} className="mr-1 inline" /> Mark not grant-funded{selectedUnassigned.length && selectedUnassigned.length < selected.size ? ` (${selectedUnassigned.length})` : ''}
          </button>
          <button className="ml-auto text-rail-text hover:text-white focus-visible:outline-white" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <Card padded={false} className="overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-slate-2">
            <tr className="border-b border-line-2">
              <th className="w-11 px-4 py-3">
                <label className="inline-flex items-center justify-center"><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} /></label>
              </th>
              <th className="w-28 px-3 py-3">Date</th>
              <th className="px-3 py-3">Description</th>
              <th className="w-28 px-3 py-3 text-right">Amount</th>
              <th className="w-[23%] px-3 py-3">Grant · category</th>
              <th className="w-[19%] px-3 py-3">Checks</th>
              <th className="w-24 px-3 py-3 text-center">Reviewed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-2">
            {missing.map((m) => (
              <tr key={`${m.grantId}-${m.categoryId}-${m.vendor}-${m.month}`} className="bg-warn-soft/40">
                <td className="px-4 py-3"><CalendarX2 size={15} className="text-warn" aria-hidden /></td>
                <td className="px-3 py-3 text-slate-2">{fmtDate(`${m.month}-01`, { month: 'short', year: 'numeric' })}</td>
                <td className="px-3 py-3">
                  <div className="font-medium text-slate">{m.label}</div>
                  <div className="text-xs text-slate-3">Charged every month before; record it or explain the gap before reporting.</div>
                </td>
                <td className="px-3 py-3 text-right text-slate-3">—</td>
                <td className="px-3 py-3 text-xs"><Link to={`/grants/${m.grantId}?tab=budget`} className="text-link hover:underline">{grantName(m.grantId)}</Link></td>
                <td className="px-3 py-3"><StatusPill tone="warn">Missing charge</StatusPill></td>
                <td className="px-3 py-3" />
              </tr>
            ))}
            {rows.map((t) => {
              const fl = flags.get(t.id) ?? []
              return (
                <tr key={t.id} onClick={() => setOpenTx(t)} className={clsx('cursor-pointer hover:bg-canvas', selected.has(t.id) && 'bg-link-soft/50')}>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <label className="inline-flex items-center justify-center"><input
                      type="checkbox"
                      aria-label={`Select ${t.description}`}
                      checked={selected.has(t.id)}
                      onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n })}
                    /></label>
                  </td>
                  <td className="px-3 py-3 text-slate-2">{fmtDate(t.date)}</td>
                  <td className="min-w-0 px-3 py-3">
                    <button type="button" className="text-left font-medium text-link hover:underline" onClick={(e) => { e.stopPropagation(); setOpenTx(t) }} aria-label={`Review transaction: ${t.description}`}>{t.description}</button>
                    <div className="break-words text-xs text-slate-3">{t.vendor}{t.account && ` · ${t.account}`}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{moneyExact(t.amount)}</td>
                  <td className="px-3 py-3">
                    {t.allocations.length ? (
                      <div className="space-y-0.5">
                        {t.allocations.map((a, i) => (
                          <div key={i} className="text-xs">
                            <span className="text-link">{grantName(a.grantId)}</span>
                            <span className="text-slate-3"> · {allocationCategoryName(grantFor(a.grantId), a)}{t.allocations.length > 1 && ` · ${moneyExact(a.amount)}`}</span>
                          </div>
                        ))}
                      </div>
                    ) : t.notGrantFunded ? (
                      <span className="text-xs text-slate-2">Not grant-funded</span>
                    ) : (
                      <span className="text-xs text-slate-3">— Assign</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {fl.length ? fl.map((f, i) => <StatusPill key={i} tone={f.kind === 'unassigned' ? 'warn' : 'bad'}>{FLAG_LABEL[f.kind]}</StatusPill>) : <StatusPill tone="good">Compliant</StatusPill>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {t.reviewed ? <CheckCircle2 size={17} className="inline text-good" aria-label="Reviewed" /> : <Circle size={17} className="inline text-line" aria-label="Not reviewed" />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && !missing.length && <p className="py-12 text-center text-sm text-slate-3">{view === 'to-review' ? 'Nothing to review. Every expense is assigned, checked and reviewed.' : 'No transactions in this view.'}</p>}
        <div className="flex justify-between border-t border-line-2 bg-canvas px-5 py-2.5 text-xs text-slate-2">
          <span>{rows.length} transactions{missing.length ? ` · ${missing.length} missing charges` : ''}</span>
          <span className="tabular-nums">Total {moneyExact(sumDollars(rows.map((r) => r.amount)))}</span>
        </div>
      </Card>

      {!canReview && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-3"><Lock size={12} /> View only. Switch to Finance or Director to reclassify.</p>}

      {openTx && <AllocationDrawer key={openTx.id} tx={openTx} onClose={() => setOpenTx(null)} />}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  )
}
