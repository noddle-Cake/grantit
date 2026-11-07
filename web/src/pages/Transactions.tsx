import clsx from 'clsx'
import { AlertOctagon, CheckCheck, CheckCircle2, Circle, Lock, Plus, Search, Trash2, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ImportModal } from './ImportModal'
import { Button, Card, Drawer, Field, Input, PageHeader, Pill, Segmented, Select, StatusPill } from '../components/ui'
import { FLAG_LABEL } from '../lib/finance'
import { fmtDate, moneyExact } from '../lib/format'
import { can } from '../lib/permissions'
import { useStore } from '../store/AppStore'
import type { Allocation, Transaction } from '../types'

type View = 'all' | 'flagged' | 'unassigned' | 'unreviewed'

function AllocationDrawer({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { state, flags, me, setAllocations, markReviewed, notify } = useStore()
  const [allocs, setAllocs] = useState<Allocation[]>(tx.allocations.length ? tx.allocations : [])
  const editable = can(me.role, 'finance:review')
  const total = allocs.reduce((s, a) => s + (Number(a.amount) || 0), 0)
  const balanced = allocs.length === 0 || Math.abs(total - tx.amount) < 0.005
  const txFlags = flags.get(tx.id) ?? []
  const grantFor = (id: string) => state.grants.find((g) => g.id === id)

  const update = (i: number, patch: Partial<Allocation>) => setAllocs((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  function save(review: boolean) {
    setAllocations(tx.id, allocs.map((a) => ({ ...a, amount: Number(a.amount) })))
    if (review) markReviewed([tx.id])
    notify(review ? 'Classification saved and marked reviewed' : 'Classification saved')
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Review transaction"
      width={560}
      footer={
        editable ? (
          <>
            <Button disabled={!balanced} onClick={() => save(true)} icon={<CheckCheck size={15} />}>Save & mark reviewed</Button>
            <Button variant="secondary" disabled={!balanced} onClick={() => save(false)}>Save</Button>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-slate-3"><Lock size={14} /> Finance staff or Director can reclassify</span>
        )
      }
    >
      <div className="rounded-xl bg-canvas p-4">
        <div className="text-xs text-slate-3">{fmtDate(tx.date)} · {tx.account} · {tx.source === 'csv' ? 'CSV import' : 'QuickBooks sample'}</div>
        <div className="mt-1 text-[15px] font-medium text-slate">{tx.description}</div>
        <div className="text-sm text-slate-2">{tx.vendor}</div>
        <div className="mt-2 text-2xl font-semibold tabular-nums text-slate">{moneyExact(tx.amount)}</div>
      </div>

      {txFlags.length > 0 && (
        <div className="mt-4 space-y-2">
          {txFlags.map((f, i) => (
            <div key={i} className="flex gap-2.5 rounded-lg bg-bad-soft px-3.5 py-2.5 text-sm">
              <AlertOctagon size={16} className="mt-0.5 shrink-0 text-bad" />
              <div><span className="font-medium text-slate">{FLAG_LABEL[f.kind]}.</span> <span className="text-slate-2">{f.message}</span></div>
            </div>
          ))}
        </div>
      )}

      <h3 className="mb-2 mt-6 text-sm font-semibold text-slate">Grant allocation</h3>
      <fieldset disabled={!editable} className="space-y-3">
        {allocs.map((a, i) => {
          const g = grantFor(a.grantId)
          const known = g?.categories.some((c) => c.name === a.category)
          return (
            <div key={i} className="rounded-lg border border-line-2 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Grant">
                  <Select value={a.grantId} onChange={(e) => update(i, { grantId: e.target.value, category: grantFor(e.target.value)?.categories[0]?.name ?? '' })}>
                    {state.grants.filter((x) => x.categories.length).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </Select>
                </Field>
                <Field label="Spending category">
                  <Select value={a.category} onChange={(e) => update(i, { category: e.target.value })} className={clsx(!known && 'border-bad text-bad')}>
                    {!known && <option value={a.category}>{a.category} (not approved)</option>}
                    {g?.categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="mt-3 flex items-end gap-2">
                <Field label="Amount" className="flex-1">
                  <Input type="number" step="0.01" value={a.amount} onChange={(e) => update(i, { amount: Number(e.target.value) })} />
                </Field>
                <button type="button" aria-label="Remove allocation" onClick={() => setAllocs((x) => x.filter((_, j) => j !== i))} className="mb-1 rounded p-2 text-slate-3 hover:bg-bad-soft hover:text-bad"><Trash2 size={15} /></button>
              </div>
            </div>
          )
        })}
        {editable && (
          <button
            type="button"
            onClick={() => {
              const g = state.grants.find((x) => x.categories.length && (x.stage === 'awarded' || x.stage === 'reporting'))!
              setAllocs((x) => [...x, { grantId: g.id, category: g.categories[0].name, amount: Math.max(tx.amount - total, 0) }])
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2.5 text-sm text-link hover:bg-link-soft"
          >
            <Plus size={14} /> {allocs.length ? 'Split across another grant' : 'Assign to a grant'}
          </button>
        )}
      </fieldset>
      {allocs.length > 0 && (
        <div className={clsx('mt-3 flex justify-between rounded-lg px-3 py-2 text-sm', balanced ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>
          <span>Allocated {moneyExact(total)} of {moneyExact(tx.amount)}</span>
          <span>{balanced ? 'Balanced' : `${moneyExact(tx.amount - total)} remaining`}</span>
        </div>
      )}
      {allocs.length > 1 && allocs.some((a) => !grantFor(a.grantId)?.allowSplit) && (
        <p className="mt-2 text-xs text-warn">One of these funders does not permit shared-cost allocation.</p>
      )}
    </Drawer>
  )
}

export default function Transactions() {
  const { state, flags, me, markReviewed, notify } = useStore()
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View) ?? 'all'
  const grantFilter = params.get('grant') ?? 'all'
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openTx, setOpenTx] = useState<Transaction | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const canReview = can(me.role, 'finance:review')

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v === 'all') p.delete(k)
    else p.set(k, v)
    setParams(p)
  }

  const counts = {
    all: state.transactions.length,
    flagged: state.transactions.filter((t) => flags.get(t.id)?.length).length,
    unassigned: state.transactions.filter((t) => !t.allocations.length).length,
    unreviewed: state.transactions.filter((t) => !t.reviewed).length,
  }

  const rows = useMemo(
    () =>
      state.transactions
        .filter((t) => (view === 'flagged' ? flags.get(t.id)?.length : view === 'unassigned' ? !t.allocations.length : view === 'unreviewed' ? !t.reviewed : true))
        .filter((t) => grantFilter === 'all' || t.allocations.some((a) => a.grantId === grantFilter))
        .filter((t) => (t.vendor + t.description + t.account).toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.transactions, flags, view, grantFilter, q],
  )
  const grantName = (id: string) => state.grants.find((g) => g.id === id)?.name ?? 'Unknown grant'
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Assign expenses to grants and approved categories. Compliance checks run automatically."
        actions={can(me.role, 'finance:import') && <Button icon={<Upload size={16} />} onClick={() => setImportOpen(true)}>Import</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented<View>
          value={view}
          onChange={(v) => setParam('view', v)}
          options={[
            { id: 'all', label: `All ${counts.all}` },
            { id: 'flagged', label: <><AlertOctagon size={13} className="text-bad" /> Flagged {counts.flagged}</> },
            { id: 'unassigned', label: `Unassigned ${counts.unassigned}` },
            { id: 'unreviewed', label: `Needs review ${counts.unreviewed}` },
          ]}
        />
        <Select value={grantFilter} onChange={(e) => setParam('grant', e.target.value)} className="!h-9 !w-60 !bg-white">
          <option value="all">All grants</option>
          {state.grants.filter((g) => g.categories.length).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vendor, memo, account" className="h-9 w-56 rounded-[3px] border border-line bg-white pl-9 pr-3 text-sm focus:border-link focus:outline-none" />
        </div>
      </div>

      {selected.size > 0 && canReview && (
        <div className="animate-pop-in mb-3 flex items-center gap-3 rounded-lg bg-obsidian-2 px-4 py-2.5 text-sm text-white">
          <span>{selected.size} selected</span>
          <button className="rounded px-2 py-1 font-medium hover:bg-white/10" onClick={() => { markReviewed([...selected]); notify(`${selected.size} marked reviewed`); setSelected(new Set()) }}>
            <CheckCheck size={14} className="mr-1 inline" /> Mark reviewed
          </button>
          <button className="ml-auto text-white/70 hover:text-white" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <Card padded={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-slate-2">
              <tr className="border-b border-line-2">
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} />
                </th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Description</th>
                <th className="px-3 py-3">GL account</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3">Grant · category</th>
                <th className="px-3 py-3">Checks</th>
                <th className="px-3 py-3">Reviewed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-2">
              {rows.map((t) => {
                const fl = flags.get(t.id) ?? []
                return (
                  <tr key={t.id} onClick={() => setOpenTx(t)} className={clsx('cursor-pointer hover:bg-canvas', selected.has(t.id) && 'bg-link-soft/50')}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${t.description}`}
                        checked={selected.has(t.id)}
                        onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n })}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-2">{fmtDate(t.date)}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate">{t.description}</div>
                      <div className="text-xs text-slate-3">{t.vendor}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-2">{t.account}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{moneyExact(t.amount)}</td>
                    <td className="px-3 py-3">
                      {t.allocations.length ? (
                        <div className="space-y-0.5">
                          {t.allocations.map((a, i) => (
                            <div key={i} className="text-xs">
                              <span className="text-link">{grantName(a.grantId)}</span>
                              <span className="text-slate-3"> · {a.category}{t.allocations.length > 1 && ` · ${moneyExact(a.amount)}`}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-3">— Assign</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {fl.length ? fl.map((f, i) => <StatusPill key={i} tone={f.kind === 'unassigned' ? 'warn' : 'bad'}>{FLAG_LABEL[f.kind]}</StatusPill>) : <StatusPill tone="good">Compliant</StatusPill>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {t.reviewed ? <CheckCircle2 size={17} className="text-good" aria-label="Reviewed" /> : <Circle size={17} className="text-line" aria-label="Not reviewed" />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!rows.length && <p className="py-12 text-center text-sm text-slate-3">No transactions in this view.</p>}
        </div>
        <div className="flex justify-between border-t border-line-2 bg-canvas px-5 py-2.5 text-xs text-slate-2">
          <span>{rows.length} transactions</span>
          <span className="tabular-nums">Total {moneyExact(rows.reduce((s, r) => s + r.amount, 0))}</span>
        </div>
      </Card>

      {!canReview && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-3"><Lock size={12} /> View only — switch to Finance or Director to reclassify.</p>}
      <div className="mt-2"><Pill>Tip</Pill> <span className="text-xs text-slate-3">Click any row to reclassify or split it across grants.</span></div>

      {openTx && <AllocationDrawer key={openTx.id} tx={openTx} onClose={() => setOpenTx(null)} />}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  )
}
