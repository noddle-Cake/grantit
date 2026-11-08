import clsx from 'clsx'
import { AlertOctagon, ArrowRightLeft, CheckCheck, Lock, Plus, Settings2, Sparkles, Trash2, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Drawer, Field, Input, Select } from '@/components/ui'
import { FLAG_LABEL, fromCents, toCents } from '@grantit/shared/finance'
import { fmtDate, moneyExact, todayISO } from '@grantit/shared/format'
import { budgetImpact, coverOverage, reallocate, suggestAllocation } from '@grantit/shared/funds'
import { can } from '@grantit/shared/permissions'
import { canReceiveTransactions } from '@grantit/shared/setup'
import { SOURCE_LABEL } from '@/lib/labels'
import { useStore } from '@/store'
import type { Allocation, Transaction, TxFlag } from '@grantit/shared/types'

// The category <select> holds a category id, or for a name the grant doesn't have, this prefix + name.
const UNMATCHED = 'unmatched:'

const hasCategory = (a: Allocation) => !!a.categoryId || !!a.unmatchedCategory

export function AllocationDrawer({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { state, flags, me, setAllocations, setNotGrantFunded, setServiceDate, markReviewed, updateGrant, notify } = useStore()
  const editable = can(me.role, 'finance:review')
  const eligible = state.grants.filter(canReceiveTransactions)
  const grantFor = (id: string) => state.grants.find((g) => g.id === id)

  // Unassigned: start from the suggestion (earlier charges to this payee, then the GL account), never a guess.
  const suggestion = tx.allocations.length ? undefined : suggestAllocation(tx, state.grants, state.transactions)
  const [allocs, setAllocs] = useState<Allocation[]>(tx.allocations.length ? tx.allocations : suggestion ? [{ grantId: suggestion.grantId, categoryId: suggestion.categoryId, amount: tx.amount }] : [])
  const [notFunded, setNotFunded] = useState(!!tx.notGrantFunded)
  const [serviceDate, setService] = useState(tx.serviceDate ?? tx.date)

  const totalCents = allocs.reduce((s, a) => s + toCents(Number(a.amount) || 0), 0)
  const remaining = fromCents(toCents(tx.amount) - totalCents)
  const balanced = allocs.length === 0 || remaining === 0
  const complete = allocs.every(hasCategory)
  const canSave = balanced && complete
  const txFlags = flags.get(tx.id) ?? []

  const update = (i: number, patch: Allocation) => setAllocs((a) => a.map((x, j) => (j === i ? patch : x)))

  function save(review: boolean) {
    setAllocations(tx.id, allocs.map((a) => ({ ...a, amount: Number(a.amount) })))
    setServiceDate(tx.id, serviceDate === tx.date ? undefined : serviceDate)
    if (!allocs.length && notFunded !== !!tx.notGrantFunded) setNotGrantFunded([tx.id], notFunded)
    if (review) markReviewed([tx.id])
    notify(review ? 'Classification saved and marked reviewed' : 'Classification saved')
    onClose()
  }

  function moveToUnrestricted() {
    setAllocations(tx.id, [])
    setNotGrantFunded([tx.id], true)
    notify('Moved to unrestricted funds')
    onClose()
  }

  /** Re-point the flagged grant's share at another open grant; the user confirms the category and saves. */
  function moveToAnotherGrant(fromGrantId?: string) {
    const target = (suggestion && suggestion.grantId !== fromGrantId ? suggestion.grantId : undefined) ?? eligible.find((g) => g.id !== fromGrantId)?.id
    if (!target) return
    const categoryId = suggestion?.grantId === target ? suggestion.categoryId : undefined
    setAllocs((xs) => (xs.length ? xs.map((a) => (a.grantId === fromGrantId ? { grantId: target, categoryId, amount: a.amount } : a)) : [{ grantId: target, categoryId, amount: tx.amount }]))
    setNotFunded(false)
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Review transaction"
      width={580}
      footer={
        editable ? (
          <>
            <Button disabled={!canSave} onClick={() => save(true)} icon={<CheckCheck size={15} />}>Save & mark reviewed</Button>
            <Button variant="secondary" disabled={!canSave} onClick={() => save(false)}>Save</Button>
            {!complete ? <span className="text-xs text-bad">Choose a category for each grant.</span> : !balanced && <span className="text-xs text-bad">Allocations must add up to the transaction amount.</span>}
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
            <FlagFix key={i} flag={f} tx={tx} editable={editable} onUnrestricted={moveToUnrestricted} onMove={() => moveToAnotherGrant(f.grantId)} onCover={(grantId, from, to, amount, label) => {
              const g = grantFor(grantId)!
              updateGrant(grantId, reallocate(g, from, to, amount, todayISO()))
              notify(label)
            }} />
          ))}
        </div>
      )}

      <h3 className="mb-2 mt-6 text-sm font-semibold text-slate">Grant allocation</h3>
      {suggestion && allocs.length === 1 && allocs[0].grantId === suggestion.grantId && allocs[0].categoryId === suggestion.categoryId && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-2">
          <Sparkles size={13} className="text-link" /> Suggested from {suggestion.reason === 'vendor' ? `earlier charges to ${tx.vendor}` : `how account ${tx.account.split(' ')[0]} has been categorized`}. Check it, then save.
        </p>
      )}
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
            const value = known ? a.categoryId! : a.unmatchedCategory ? `${UNMATCHED}${a.unmatchedCategory}` : ''
            const grantOptions = g && !eligible.includes(g) ? [g, ...eligible] : eligible
            const impact = known && g ? budgetImpact(g, a.categoryId!, state.transactions, tx.id, Number(a.amount) || 0) : undefined
            return (
              <div key={i} className="rounded-lg border border-line-2 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Grant">
                    <Select value={a.grantId} onChange={(e) => update(i, { grantId: e.target.value, amount: a.amount })}>
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
                          : { grantId: a.grantId, categoryId: e.target.value || undefined, amount: a.amount })
                      }
                      className={clsx(a.unmatchedCategory && 'border-bad text-bad')}
                    >
                      {!value && <option value="">Choose a category</option>}
                      {a.unmatchedCategory && <option value={value}>{a.unmatchedCategory} (not approved)</option>}
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
                {impact && (
                  <p className={clsx('mt-2 text-xs tabular-nums', impact.overBy > 0 ? 'font-medium text-bad' : 'text-slate-2')} role="status">
                    {impact.categoryName}: {moneyExact(impact.before)} → {moneyExact(impact.after)} of {moneyExact(impact.budget)}
                    {impact.overBy > 0 ? ` (over by ${moneyExact(impact.overBy)})` : ` (${moneyExact(fromCents(toCents(impact.budget) - toCents(impact.after)))} left)`}
                  </p>
                )}
              </div>
            )
          })}
          {editable && eligible.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const unused = eligible.find((x) => !allocs.some((a) => a.grantId === x.id))
                const s = !allocs.length && suggestion
                setNotFunded(false)
                setAllocs((x) => [...x, s ? { grantId: s.grantId, categoryId: s.categoryId, amount: remaining } : { grantId: (unused ?? eligible[0]).id, amount: remaining }])
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

      <Field label="Service date" className="mt-4" hint="When the paid-for service happens. The funding-period check uses this date.">
        <Input type="date" disabled={!editable} value={serviceDate} onChange={(e) => setService(e.target.value || tx.date)} />
      </Field>

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

/** A compliance flag with the action that resolves it. */
function FlagFix({ flag, tx, editable, onUnrestricted, onMove, onCover }: {
  flag: TxFlag
  tx: Transaction
  editable: boolean
  onUnrestricted: () => void
  onMove: () => void
  onCover: (grantId: string, from: string, to: string, amount: number, label: string) => void
}) {
  const { state } = useStore()
  const grant = flag.grantId ? state.grants.find((g) => g.id === flag.grantId) : undefined
  const alloc = grant && tx.allocations.find((a) => a.grantId === grant.id && a.categoryId)
  const cover = flag.kind === 'over-budget' && grant && alloc ? coverOverage(grant, alloc.categoryId!, state.transactions, todayISO()) : undefined

  const fix = (() => {
    if (!editable) return null
    switch (flag.kind) {
      case 'unauthorized-category':
        return (
          <>
            <Button size="sm" variant="secondary" icon={<Wallet size={14} />} onClick={onUnrestricted}>Move to unrestricted funds</Button>
            <Button size="sm" variant="secondary" icon={<ArrowRightLeft size={14} />} onClick={onMove}>Move to another grant</Button>
          </>
        )
      case 'outside-period':
        return (
          <>
            <Button size="sm" variant="secondary" icon={<ArrowRightLeft size={14} />} onClick={onMove}>Move to another grant</Button>
            <Button size="sm" variant="secondary" icon={<Wallet size={14} />} onClick={onUnrestricted}>Mark not grant-funded</Button>
          </>
        )
      case 'over-budget':
        if (!cover) return null
        if (cover.source && !cover.needsApproval)
          return (
            <Button
              size="sm"
              variant="secondary"
              icon={<ArrowRightLeft size={14} />}
              onClick={() => onCover(grant!.id, cover.source!.id, cover.categoryId, cover.overage, `Moved ${moneyExact(cover.overage)} from ${cover.source!.name} to ${cover.categoryName}`)}
            >
              Cover from {cover.source.name} — no approval needed
            </Button>
          )
        return (
          <span className="text-xs text-slate-2">
            Moving {moneyExact(cover.overage)} into {cover.categoryName} needs the funder's written approval
            {cover.thresholdPct !== undefined ? ` (their rule: more than ${cover.thresholdPct}% of a category)` : ' (no rebudget allowance is recorded for this funder)'}.
          </span>
        )
      default:
        return null
    }
  })()

  return (
    <div className="rounded-lg bg-bad-soft px-3.5 py-2.5 text-sm">
      <div className="flex gap-2.5">
        <AlertOctagon size={16} className="mt-0.5 shrink-0 text-bad" />
        <div><span className="font-medium text-slate">{FLAG_LABEL[flag.kind]}.</span> <span className="text-slate-2">{flag.message}</span></div>
      </div>
      {fix && <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">{fix}</div>}
    </div>
  )
}
