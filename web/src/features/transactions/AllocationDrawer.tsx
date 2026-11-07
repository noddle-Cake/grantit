import clsx from 'clsx'
import { AlertOctagon, CheckCheck, Lock, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, Drawer, Field, Input, Select } from '@/components/ui'
import { FLAG_LABEL } from '@grantit/shared/finance'
import { fmtDate, moneyExact } from '@grantit/shared/format'
import { can } from '@grantit/shared/permissions'
import { useStore } from '@/store'
import type { Allocation, Transaction } from '@grantit/shared/types'

export function AllocationDrawer({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
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
        <div className="mt-1 text-[0.9375rem] font-medium text-slate">{tx.description}</div>
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
