import clsx from 'clsx'
import { ArrowRightLeft, CheckCheck, Lock, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, Drawer, Field, Input, Select } from '@/components/ui'
import { isLocked } from '@grantit/shared/auto-assign'
import { effectiveDate, fromCents, toCents } from '@grantit/shared/finance'
import { fmtDate, moneyExact, todayISO } from '@grantit/shared/format'
import { budgetImpact, coverOverage, reallocate } from '@grantit/shared/funds'
import { can } from '@grantit/shared/permissions'
import { ORIGIN_LABEL } from '@/lib/labels'
import { useStore } from '@/store'
import type { Allocation, Grant, Transaction } from '@grantit/shared/types'
import { dollars, GENERAL, GENERAL_LABEL, lineOptions, parseTarget, targetKey, targetLabel } from './grantOptions'

/**
 * One expense in full: its coding, its GL account, and the split editor. Category, program and service date save as
 * they change and re-suggest the split; edits to the split itself stay a draft until confirmed.
 */
export function AllocationDrawer({ txId, draft, onClose }: { txId: string; draft?: Allocation[]; onClose: () => void }) {
  const { state, me, recodeTransaction, assignTransaction, confirmTransactions, notify } = useStore()
  const [edited, setEdited] = useState<Allocation[] | null>(draft ?? null)
  const tx = state.transactions.find((t) => t.id === txId)
  if (!tx) return null

  const editable = can(me.role, 'finance:review')
  const allocs = edited ?? tx.allocations
  const options = lineOptions(tx, state)
  const totalCents = allocs.reduce((s, a) => s + toCents(Number(a.amount) || 0), 0)
  const remaining = fromCents(toCents(tx.amount) - totalCents)
  const balanced = remaining === 0
  const canConfirm = allocs.length > 0 && balanced && (!!edited || tx.status !== 'done')
  const grantIds = new Set(allocs.flatMap((a) => a.grantId ?? []))
  const sharedNotAllowed = grantIds.size > 1 && [...grantIds].some((id) => !state.grants.find((g) => g.id === id)?.allowSplit)

  const recode = (coding: Parameters<typeof recodeTransaction>[1]) => {
    recodeTransaction(tx.id, coding)
    if (!isLocked(tx)) setEdited(null)
  }
  const updateLine = (i: number, patch: Partial<Allocation>) => setEdited(allocs.map((a, j) => (j === i ? { ...a, ...patch } : a)))

  function addLine() {
    const unused = options.find((o) => !allocs.some((a) => targetKey(a) === o.value))
    setEdited([...allocs, { ...parseTarget(unused?.value ?? GENERAL), amount: remaining }])
  }

  function confirm() {
    if (edited) assignTransaction(tx!.id, edited.map((a) => ({ ...a, amount: Number(a.amount) })))
    else confirmTransactions([tx!.id])
    notify('Expense confirmed')
    onClose()
  }

  const hint = !allocs.length ? (tx.reason ?? 'Choose where this goes.') : !balanced ? 'The lines must add up to the expense.' : ''

  return (
    <Drawer
      open
      onClose={onClose}
      title="Review expense"
      width={580}
      footer={
        editable ? (
          <>
            {(tx.status !== 'done' || edited) && <Button disabled={!canConfirm} onClick={confirm} icon={<CheckCheck size={15} />}>Confirm</Button>}
            {hint && <span className="text-xs text-warn">{hint}</span>}
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-slate-3"><Lock size={14} /> Finance staff or Director can code expenses</span>
        )
      }
    >
      <div className="rounded-xl bg-canvas p-4">
        <div className="text-xs text-slate-3">{fmtDate(tx.date)} · GL {tx.account || 'none'} · {ORIGIN_LABEL[tx.origin]}</div>
        <div className="mt-1 text-[0.9375rem] font-medium text-slate">{tx.description || 'No description'}</div>
        <div className="text-sm text-slate-2">{tx.vendor}</div>
        <div className="mt-2 text-2xl font-semibold tabular-nums text-slate">{moneyExact(tx.amount)}</div>
        {tx.amount < 0 && <div className="mt-1 text-xs text-slate-2">Refund: reduces spending on the line it's charged to.</div>}
      </div>

      <fieldset disabled={!editable} className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <Select value={tx.categoryId ?? ''} onChange={(e) => recode({ categoryId: e.target.value })}>
            {!tx.categoryId && <option value="">Pick a category</option>}
            {state.orgCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Program">
          <Select value={tx.programId ?? ''} onChange={(e) => recode({ programId: e.target.value })}>
            {!tx.programId && <option value="">Pick a program</option>}
            {state.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Service date">
          <Input type="date" value={effectiveDate(tx)} onChange={(e) => recode({ serviceDate: e.target.value || undefined })} />
        </Field>
      </fieldset>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-slate">Who pays</h3>
      {tx.reason && !edited && allocs.length > 0 && <p className="mb-2 text-xs text-slate-2">{tx.reason}</p>}

      <fieldset disabled={!editable} className="space-y-3">
        {allocs.map((a, i) => (
          <AllocationLine
            key={i}
            tx={tx}
            allocation={a}
            allocations={allocs}
            manual={!!edited}
            editable={editable}
            onTarget={(value) => updateLine(i, { budgetLineId: undefined, ...parseTarget(value) })}
            onAmount={(amount) => updateLine(i, { amount })}
            onRemove={() => setEdited(allocs.filter((_, j) => j !== i))}
          />
        ))}
        {editable && (
          <button type="button" onClick={addLine} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2.5 text-sm text-link hover:bg-link-soft">
            <Plus size={14} /> {allocs.length ? 'Split across another line' : 'Add a line'}
          </button>
        )}
      </fieldset>

      {allocs.length > 0 && (
        <div className={clsx('mt-3 flex justify-between rounded-lg px-3 py-2 text-sm', balanced ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad')}>
          <span>Allocated {moneyExact(fromCents(totalCents))} of {moneyExact(tx.amount)}</span>
          <span>{balanced ? 'Balanced' : `${moneyExact(remaining)} ${remaining > 0 ? 'unallocated' : 'too much'}`}</span>
        </div>
      )}
      {sharedNotAllowed && <p className="mt-2 text-xs text-warn">One of these funders does not permit shared-cost allocation.</p>}
    </Drawer>
  )
}

/** One row of the split editor: where it's charged, how much, and what that does to the line's budget. */
function AllocationLine({ tx, allocation: a, allocations, manual, editable, onTarget, onAmount, onRemove }: {
  tx: Transaction
  allocation: Allocation
  allocations: Allocation[]
  manual: boolean
  editable: boolean
  onTarget: (value: string) => void
  onAmount: (amount: number) => void
  onRemove: () => void
}) {
  const { state, updateGrant, notify } = useStore()
  const value = targetKey(a)
  const options = lineOptions(tx, state)
  const grant = state.grants.find((g) => g.id === a.grantId)
  const impact = grant && a.budgetLineId ? budgetImpact(grant, a.budgetLineId, state.transactions, tx.id, Number(a.amount) || 0) : undefined

  return (
    <div className="rounded-lg border border-line-2 p-3">
      <div className="flex items-end gap-2">
        <Field label="Charge to" className="min-w-0 flex-1">
          <Select value={value} onChange={(e) => onTarget(e.target.value)} className="truncate">
            {a.grantId !== null && !options.some((o) => o.value === value) && <option value={value}>{targetLabel(a, state)}</option>}
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            <option value={GENERAL}>{GENERAL_LABEL}</option>
          </Select>
        </Field>
        <Field label="Amount" className="w-32 shrink-0">
          <Input type="number" step="0.01" value={a.amount} onChange={(e) => onAmount(Number(e.target.value))} />
        </Field>
        <button type="button" aria-label="Remove line" onClick={onRemove} className="mb-1 rounded p-2 text-slate-3 hover:bg-bad-soft hover:text-bad"><Trash2 size={15} /></button>
      </div>
      {impact && (
        <p className={clsx('mt-2 text-xs tabular-nums', impact.overBy > 0 ? 'font-medium text-bad' : 'text-slate-2')} role="status">
          {impact.categoryName}: {dollars(impact.before)} → {dollars(impact.after)} of {dollars(impact.budget)}
          {impact.overBy > 0 ? ` (${dollars(impact.overBy)} over)` : ` (${dollars(fromCents(toCents(impact.budget) - toCents(impact.after)))} left)`}
        </p>
      )}
      {manual && editable && grant && impact && impact.overBy > 0 && (
        <CoverOverage
          grant={grant}
          lineId={a.budgetLineId!}
          txs={state.transactions.map((t) => (t.id === tx.id ? { ...t, allocations } : t))}
          onCover={(from, amount, label) => {
            updateGrant(grant.id, reallocate(grant, from, a.budgetLineId!, amount, todayISO()))
            notify(label)
          }}
        />
      )}
    </div>
  )
}

/** The rebudget offer when a person puts more on a line than it has: one click if the funder's threshold allows it. */
function CoverOverage({ grant, lineId, txs, onCover }: { grant: Grant; lineId: string; txs: Transaction[]; onCover: (from: string, amount: number, label: string) => void }) {
  const cover = coverOverage(grant, lineId, txs, todayISO())
  if (!cover) return null
  if (cover.source && !cover.needsApproval) {
    const { source, overage, categoryName } = cover
    return (
      <Button
        size="sm"
        variant="secondary"
        className="mt-2"
        icon={<ArrowRightLeft size={14} />}
        onClick={() => onCover(source.id, overage, `Moved ${dollars(overage)} from ${source.name} to ${categoryName}`)}
      >
        Cover {dollars(overage)} from {source.name} — no approval needed
      </Button>
    )
  }
  return (
    <p className="mt-2 text-xs text-slate-2">
      Moving {dollars(cover.overage)} into {cover.categoryName} needs the funder's written approval
      {cover.thresholdPct !== undefined ? ` (their rule: more than ${cover.thresholdPct}% of a category)` : ' (no rebudget allowance is recorded for this funder)'}.
    </p>
  )
}
