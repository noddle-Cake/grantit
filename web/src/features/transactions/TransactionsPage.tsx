import clsx from 'clsx'
import { AlertOctagon, CheckCheck, CheckCircle2, Circle, Lock, Search, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ImportModal } from './ImportModal'
import { Button, Card, PageHeader, Pill, Segmented, Select, StatusPill } from '@/components/ui'
import { FLAG_LABEL } from '@grantit/shared/finance'
import { fmtDate, moneyExact } from '@grantit/shared/format'
import { can } from '@grantit/shared/permissions'
import { useStore } from '@/store'
import type { Transaction } from '@grantit/shared/types'
import { AllocationDrawer } from './AllocationDrawer'

type View = 'all' | 'flagged' | 'unassigned' | 'unreviewed'

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
        eyebrow="Manage funds"
        title="Spending"
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
        <Select value={grantFilter} onChange={(e) => setParam('grant', e.target.value)} className="!h-9 !w-60 !bg-surface">
          <option value="all">All grants</option>
          {state.grants.filter((g) => g.categories.length).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vendor, memo, account" className="h-9 w-56 rounded-[3px] border border-line bg-surface pl-9 pr-3 text-sm focus:border-link focus:outline-none" />
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
