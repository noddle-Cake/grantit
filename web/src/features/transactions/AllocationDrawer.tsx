import clsx from 'clsx'
import { AlertOctagon, CheckCheck, Lock, Plus, Settings2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Drawer, Field, Input, Select } from '@/components/ui'
import { FLAG_LABEL, fromCents, toCents } from '@grantit/shared/finance'
import { fmtDate, moneyExact } from '@grantit/shared/format'
import { can } from '@grantit/shared/permissions'
import { canReceiveTransactions } from '@grantit/shared/setup'
import { SOURCE_LABEL } from '@/lib/labels'
import { useStore } from '@/store'
import type { Allocation, Transaction } from '@grantit/shared/types'

// The category <select> holds either a category id or, for a name the grant doesn't have, this prefix + name.
const UNMATCHED = 'unmatched:'

export function AllocationDrawer({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { state, flags, me, setAllocations, setNotGrantFunded, markReviewed, notify } = useStore()
  const [allocs, setAllocs] = useState<Allocation[]>(tx.allocations)
  const [notFunded, setNotFunded] = useState(!!tx.notGrantFunded)
  const editable = can(me.role, 'finance:review')
  const eligible = state.grants.filter(canReceiveTransactions)
  const totalCents = allocs.reduce((s, a) => s + toCents(Number(a.amount) || 0), 0)
  const remaining = fromCents(toCents(tx.amount) - totalCents)
  const balanced = allocs.length === 0 || remaining === 0
  const txFlags = flags.get(tx.id) ?? []
  const grantFor = (id: string) => state.grants.find((g) => g.id === id)

  const update = (i: number, patch: Allocation) => setAllocs((a) => a.map((x, j) => (j === i ? patch : x)))
  const firstCategory = (grantId: string, amount: number): Allocation => {
    const c = grantFor(grantId)?.categories[0]
    return c ? { grantId, categoryId: c.id, amount } : { grantId, unmatchedCategory: '', amount }
  }

  function save(review: boolean) {
    const clean = allocs.map((a) => ({ ...a, amount: Number(a.amount) }))
    setAllocations(tx.id, clean)
    if (!clean.length && notFunded !== !!tx.notGrantFunded) setNotGrantFunded([tx.id], notFunded)
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
            {!balanced && <span className="text-xs text-bad">Allocations must add up to the transaction amount.</span>}
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-slate-3"><Lock size={14} /> Finance staff or Director can reclassify</span>
        )
      }
    >
      <div className="rounded-xl bg-canvas p-4">
        <div className="text-xs text-slate-3">{fmtDate(tx.date)} · {tx.account || 'No account'} · {SOURCE_LABEL[tx.source]}</div>
        <div className="mt-1 text-[0.9375rem] font-medium text-slate">{tx.description || 'No description'}</div>
        <div className="text-sm text-slate-2">{tx.vendor}</div>
        <div className="mt-2 text-2xl font-semibold tabular-nums text-slate">{moneyExact(tx.amount)}</div>
        {tx.amount < 0 && <div className="mt-1 text-xs text-slate-2">Credit or refund: reduces spending in the category it's allocated to.</div>}
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
      {!eligible.length && !allocs.length ? (
        <div className="rounded-lg border border-dashed border-line px-4 py-5 text-center text-sm text-slate-2">
          <Settings2 size={18} className="mx-auto mb-1.5 text-slate-3" />
          No grant can receive transactions yet. Confirm an awarded grant's budget on its Setup tab first.
          <div className="mt-2"><Link to="/funds" className="text-link hover:underline">Go to funded grants →</Link></div>
        </div>
      ) : (
        <fieldset disabled={!editable} className="space-y-3">
          {allocs.map((a, i) => {
            const g = grantFor(a.grantId)
            const known = !!a.categoryId && !!g?.categories.some((c) => c.id === a.categoryId)
            const value = known ? a.categoryId! : `${UNMATCHED}${a.unmatchedCategory ?? ''}`
            const unmatchedLabel = a.unmatchedCategory || (a.categoryId ? 'Deleted category' : 'No category')
            const grantOptions = g && !eligible.includes(g) ? [g, ...eligible] : eligible
            return (
              <div key={i} className="rounded-lg border border-line-2 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Grant">
                    <Select value={a.grantId} onChange={(e) => update(i, firstCategory(e.target.value, a.amount))}>
                      {grantOptions.map((x) => (
                        <option key={x.id} value={x.id} disabled={!eligible.includes(x)}>
                          {x.name}{eligible.includes(x) ? '' : ' (not open for spending)'}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Spending category">
                    <Select
                      value={value}
                      onChange={(e) =>
                        update(i, e.target.value.startsWith(UNMATCHED)
                          ? { grantId: a.grantId, unmatchedCategory: e.target.value.slice(UNMATCHED.length), amount: a.amount }
                          : { grantId: a.grantId, categoryId: e.target.value, amount: a.amount })
                      }
                      className={clsx(!known && 'border-bad text-bad')}
                    >
                      {!known && <option value={value}>{unmatchedLabel} (not approved)</option>}
                      {g?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <Field label="Amount" className="flex-1">
                    <Input type="number" step="0.01" value={a.amount} onChange={(e) => update(i, { ...a, amount: Number(e.target.value) })} />
                  </Field>
                  <button type="button" aria-label="Remove allocation" onClick={() => setAllocs((x) => x.filter((_, j) => j !== i))} className="mb-1 rounded p-2 text-slate-3 hover:bg-bad-soft hover:text-bad"><Trash2 size={15} /></button>
                </div>
              </div>
            )
          })}
          {editable && eligible.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const g = eligible.find((x) => !allocs.some((a) => a.grantId === x.id)) ?? eligible[0]
                setNotFunded(false)
                setAllocs((x) => [...x, firstCategory(g.id, remaining)])
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2.5 text-sm text-link hover:bg-link-soft"
            >
              <Plus size={14} /> {allocs.length ? 'Split across another grant' : 'Assign to a grant'}
            </button>
          )}
        </fieldset>
      )}
      {allocs.length > 0 && (
        <div className={clsx('mt-3 flex justify-between rounded-lg px-3 py-2 text-sm', balanced ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>
          <span>Allocated {moneyExact(fromCents(totalCents))} of {moneyExact(tx.amount)}</span>
          <span>{balanced ? 'Balanced' : `${moneyExact(remaining)} ${remaining > 0 ? 'unallocated' : 'too much'}`}</span>
        </div>
      )}
      {allocs.length > 1 && allocs.some((a) => !grantFor(a.grantId)?.allowSplit) && (
        <p className="mt-2 text-xs text-warn">One of these funders does not permit shared-cost allocation.</p>
      )}
      {!allocs.length && (
        <label className={clsx('mt-4 flex items-start gap-2.5 rounded-lg border border-line-2 p-3 text-sm', !editable && 'opacity-60')}>
          <input type="checkbox" className="mt-0.5" disabled={!editable} checked={notFunded} onChange={(e) => setNotFunded(e.target.checked)} />
          <span>
            <span className="font-medium text-slate">Not grant-funded</span>
            <span className="block text-xs text-slate-2">Paid from unrestricted funds, so it isn't flagged as unassigned. Assigning a grant clears this.</span>
          </span>
        </label>
      )}
    </Drawer>
  )
}
