import clsx from 'clsx'
import { CalendarX2, CheckCheck, Lock, Search, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ImportModal } from './ImportModal'
import { Button, Card, Pill, Segmented, Select, StatusPill } from '@/components/ui'
import { canConfirm, PICK_PROGRAM } from '@grantit/shared/auto-assign'
import { allocationCategoryName, computeFinancials, effectiveDate, sumDollars, toCents } from '@grantit/shared/finance'
import { fmtDate, moneyExact } from '@grantit/shared/format'
import { needsReview } from '@grantit/shared/funds'
import { can } from '@grantit/shared/permissions'
import { isOpenAward } from '@grantit/shared/setup'
import { useFunds } from '@/features/funds/useFunds'
import { TX_STATUS } from '@/lib/labels'
import { useStore } from '@/store'
import type { Allocation, Transaction } from '@grantit/shared/types'
import { AllocationDrawer } from './AllocationDrawer'
import { dollars, GENERAL, GENERAL_LABEL, lineOptions, parseTarget, SPLIT, targetKey, targetLabel } from './grantOptions'

type View = 'to-review' | 'all'

const CURRENT_SPLIT = 'current-split'
const compact = '!h-8 !bg-surface !py-1 !pl-2 !pr-6 !text-[0.8125rem]'

/** Spending as an inbox: what needs a decision first, the whole ledger second. */
export default function Transactions() {
  const { state, me, assignTransaction, confirmTransactions, notify } = useStore()
  const { queue } = useFunds()
  const [params, setParams] = useSearchParams()
  // Older links (?view=flagged, unassigned, unreviewed, not-funded) all land in the review inbox.
  const view: View = params.get('view') === 'all' ? 'all' : 'to-review'
  const grantFilter = params.get('grant') ?? 'all'
  const from = params.get('from')
  const to = params.get('to')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<{ id: string; draft?: Allocation[] } | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const canReview = can(me.role, 'finance:review')
  const grantOptions = state.grants.filter(isOpenAward)

  const setParam = (k: string, v: string, def: string) => {
    const p = new URLSearchParams(params)
    if (v === def) p.delete(k)
    else p.set(k, v)
    setParams(p)
  }
  const clearPeriod = () => {
    const p = new URLSearchParams(params)
    p.delete('from')
    p.delete('to')
    setParams(p)
  }

  const rows = useMemo(
    () =>
      state.transactions
        .filter((t) => view === 'all' || needsReview(t))
        .filter((t) => grantFilter === 'all' || t.allocations.some((a) => a.grantId === grantFilter))
        .filter((t) => (!from || effectiveDate(t) >= from) && (!to || effectiveDate(t) <= to))
        .filter((t) => (t.vendor + t.description + t.account).toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.transactions, view, grantFilter, from, to, q],
  )
  const missing = view === 'to-review' && !q && !from ? queue.missing.filter((m) => grantFilter === 'all' || m.grantId === grantFilter) : []
  const grantName = (id: string) => state.grants.find((g) => g.id === id)?.name ?? 'Unknown grant'
  const suggested = rows.filter((t) => t.status === 'suggested')
  const selectedReady = state.transactions.filter((t) => selected.has(t.id) && canConfirm(t))
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))

  function confirm(txs: Transaction[]) {
    confirmTransactions(txs.map((t) => t.id))
    notify(`${txs.length} expense${txs.length === 1 ? '' : 's'} confirmed`)
    setSelected(new Set())
  }

  function pickGrant(t: Transaction, value: string) {
    if (value === SPLIT) return setOpen({ id: t.id })
    const allocation = { ...parseTarget(value), amount: t.amount }
    // Putting more on a line than it has left is a decision: show the overage and how to cover it first.
    const option = lineOptions(t, state).find((o) => o.value === value)
    if (option && toCents(t.amount) > toCents(option.remaining)) return setOpen({ id: t.id, draft: [allocation] })
    assignTransaction(t.id, [allocation])
    notify('Assigned and confirmed')
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented<View>
          label="Transaction view"
          value={view}
          onChange={(v) => setParam('view', v, 'to-review')}
          options={[
            { id: 'to-review', label: `To review ${queue.count}` },
            { id: 'all', label: `All ${state.transactions.length}` },
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
        {from && to && (
          <span className="text-xs text-slate-2">
            {fmtDate(from)} – {fmtDate(to)} · <button type="button" className="text-link hover:underline" onClick={clearPeriod}>Clear</button>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {can(me.role, 'finance:import') && <Button icon={<Upload size={16} />} onClick={() => setImportOpen(true)}>Import</Button>}
          {canReview && suggested.length > 0 && (
            <Button icon={<CheckCheck size={15} />} onClick={() => confirm(suggested)}>
              Confirm {suggested.length} suggestion{suggested.length === 1 ? '' : 's'}
            </Button>
          )}
        </div>
      </div>

      {selected.size > 0 && canReview && (
        <div className="animate-pop-in mb-3 flex items-center gap-3 rounded-lg bg-obsidian-2 px-4 py-2.5 text-sm text-white">
          <span>{selected.size} selected</span>
          <button
            className="rounded px-2 py-1 font-medium hover:bg-white/10 focus-visible:outline-white disabled:opacity-50"
            disabled={!selectedReady.length}
            title={selectedReady.length ? undefined : 'These still need a grant, or are already confirmed'}
            onClick={() => confirm(selectedReady)}
          >
            <CheckCheck size={14} className="mr-1 inline" /> Confirm selected{selectedReady.length < selected.size && selectedReady.length ? ` (${selectedReady.length})` : ''}
          </button>
          <button className="ml-auto text-rail-text hover:text-white focus-visible:outline-white" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <Card padded={false} className="overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-slate-2">
            <tr className="border-b border-line-2">
              <th className="w-10 py-3 pl-4">
                <label className="inline-flex items-center justify-center"><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} /></label>
              </th>
              <th className="px-3 py-3">Expense</th>
              <th className="w-24 px-3 py-3 text-right">Amount</th>
              <th className="w-44 px-3 py-3">Category</th>
              <th className="w-64 px-3 py-3">Grant</th>
              <th className="w-32 px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-2">
            {missing.map((m) => (
              <tr key={`${m.grantId}-${m.categoryId}-${m.vendor}-${m.month}`} className="bg-warn-soft/40">
                <td className="py-3 pl-4"><CalendarX2 size={15} className="text-warn" aria-hidden /></td>
                <td className="min-w-0 px-3 py-3" colSpan={3}>
                  <div className="font-medium text-slate">{m.label}</div>
                  <div className="text-xs text-slate-3">Charged every month before; record it or explain the gap before reporting.</div>
                </td>
                <td className="px-3 py-3 text-xs"><Link to={`/grants/${m.grantId}?tab=budget`} className="text-link hover:underline">{grantName(m.grantId)}</Link></td>
                <td className="px-3 py-3"><StatusPill tone="warn">Missing</StatusPill></td>
              </tr>
            ))}
            {rows.map((t) => (
              <tr key={t.id} onClick={() => setOpen({ id: t.id })} className={clsx('cursor-pointer align-top hover:bg-canvas', selected.has(t.id) && 'bg-link-soft/50')}>
                <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                  <label className="inline-flex items-center justify-center"><input
                    type="checkbox"
                    aria-label={`Select ${t.description}`}
                    checked={selected.has(t.id)}
                    onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n })}
                  /></label>
                </td>
                <td className="min-w-0 px-3 py-3">
                  <button type="button" className="text-left font-medium text-link hover:underline" onClick={(e) => { e.stopPropagation(); setOpen({ id: t.id }) }} aria-label={`Review expense: ${t.description}`}>{t.description}</button>
                  <div className="truncate text-xs text-slate-3" title={t.vendor}>{fmtDate(effectiveDate(t), { month: 'short', day: 'numeric', year: 'numeric' })} · {t.vendor}</div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{moneyExact(t.amount)}</td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><CategoryCell tx={t} disabled={!canReview} /></td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><GrantCell tx={t} disabled={!canReview} onPick={(v) => pickGrant(t, v)} /></td>
                <td className="px-3 py-3"><StatusPill tone={TX_STATUS[t.status].tone}>{TX_STATUS[t.status].label}</StatusPill></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !missing.length && <p className="py-12 text-center text-sm text-slate-3">{view === 'to-review' ? 'Nothing to review. Every expense is confirmed.' : 'No transactions in this view.'}</p>}
        <div className="flex justify-between border-t border-line-2 bg-canvas px-5 py-2.5 text-xs text-slate-2">
          <span>{rows.length} transactions{missing.length ? ` · ${missing.length} missing charges` : ''}</span>
          <span className="tabular-nums">Total {moneyExact(sumDollars(rows.map((r) => r.amount)))}</span>
        </div>
      </Card>

      {!canReview && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-3"><Lock size={12} /> View only. Switch to Finance or Director to code expenses.</p>}

      {open && <AllocationDrawer key={open.id} txId={open.id} draft={open.draft} onClose={() => setOpen(null)} />}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  )
}

function CategoryCell({ tx, disabled }: { tx: Transaction; disabled: boolean }) {
  const { state, recodeTransaction } = useStore()
  return (
    <>
      <Select aria-label={`Category for ${tx.description}`} disabled={disabled} value={tx.categoryId ?? ''} onChange={(e) => recodeTransaction(tx.id, { categoryId: e.target.value })} className={compact}>
        {!tx.categoryId && <option value="">Pick a category</option>}
        {state.orgCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <select
        aria-label={`Program for ${tx.description}`}
        disabled={disabled}
        value={tx.programId ?? ''}
        onChange={(e) => recodeTransaction(tx.id, { programId: e.target.value })}
        className={clsx('mt-0.5 w-full truncate bg-transparent py-0.5 pl-1 text-xs', tx.programId ? 'text-slate-2' : 'font-medium text-warn')}
      >
        {!tx.programId && <option value="">{PICK_PROGRAM}</option>}
        {state.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </>
  )
}

function GrantCell({ tx, disabled, onPick }: { tx: Transaction; disabled: boolean; onPick: (value: string) => void }) {
  const { state } = useStore()
  const options = lineOptions(tx, state)
  const [only] = tx.allocations.length === 1 ? tx.allocations : []
  const value = tx.allocations.length > 1 ? CURRENT_SPLIT : only ? targetKey(only) : ''
  const offList = only && only.grantId !== null && !options.some((o) => o.value === value)
  const isAuto = tx.source === 'auto' && tx.status !== 'done' && tx.allocations.length > 0
  const nameOf = (a: Allocation) => allocationCategoryName(state.grants.find((g) => g.id === a.grantId), a)

  function subline() {
    if (tx.allocations.length > 1) return tx.allocations.map((a) => `${dollars(a.amount)} ${nameOf(a)}`).join(' + ')
    if (only?.grantId) {
      const grant = state.grants.find((g) => g.id === only.grantId)
      const left = grant && computeFinancials(grant, state.transactions).categories.find((c) => c.id === only.budgetLineId)?.remaining
      return left === undefined ? nameOf(only) : `${nameOf(only)} · ${dollars(left)} left`
    }
    return tx.reason === PICK_PROGRAM ? '' : tx.reason
  }
  const note = subline()

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Select aria-label={`Grant for ${tx.description}`} disabled={disabled} value={value} onChange={(e) => onPick(e.target.value)} className={clsx(compact, 'min-w-0 flex-1 truncate')}>
          {!value && <option value="">Choose…</option>}
          {tx.allocations.length > 1 && <option value={CURRENT_SPLIT}>Split · {tx.allocations.length} lines</option>}
          {offList && <option value={value}>{targetLabel(only, state)}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          <option value={GENERAL}>{GENERAL_LABEL}</option>
          <option value={SPLIT}>Split across grants…</option>
        </Select>
        {isAuto && <Pill tone="info">Auto</Pill>}
      </div>
      {note && <div className={clsx('mt-1 truncate pl-1 text-xs', tx.status === 'needs_input' ? 'text-warn' : 'text-slate-3')} title={note}>{note}</div>}
    </>
  )
}
