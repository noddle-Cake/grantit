import clsx from 'clsx'
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Field, Input, Select, StatusPill, Textarea } from '../../components/ui'
import { money, uid } from '../../lib/format'
import { can } from '../../lib/permissions'
import { useStore } from '../../store/AppStore'
import type { Grant } from '../../types'

function Block({ title, desc, children, action }: { title: string; desc?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-line-2 pb-6 last:border-0 lg:grid-cols-[220px_1fr]">
      <div>
        <h4 className="text-sm font-semibold text-slate">{title}</h4>
        {desc && <p className="mt-1 text-xs leading-relaxed text-slate-3">{desc}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

export function SetupTab({ grant }: { grant: Grant }) {
  const { me, updateGrant, notify } = useStore()
  const editable = can(me.role, 'grant:configure')
  const [draft, setDraft] = useState<Grant>(grant)
  useEffect(() => setDraft(grant), [grant])
  const dirty = JSON.stringify(draft) !== JSON.stringify(grant)
  const set = (patch: Partial<Grant>) => setDraft((d) => ({ ...d, ...patch }))

  const budgetTotal = draft.categories.reduce((s, c) => s + (Number(c.budget) || 0), 0)
  const diff = draft.amount - budgetTotal

  const moveQ = (i: number, dir: -1 | 1) => {
    const qs = [...draft.questions]
    const j = i + dir
    if (j < 0 || j >= qs.length) return
    ;[qs[i], qs[j]] = [qs[j], qs[i]]
    set({ questions: qs })
  }

  return (
    <fieldset disabled={!editable} className="space-y-6">
      {!editable && (
        <div className="flex items-center gap-2 rounded-lg bg-canvas px-4 py-2.5 text-sm text-slate-2">
          <Lock size={14} /> Only the Director can change grant configuration.
        </div>
      )}

      <Block title="Funding period" desc="Spending is calculated within this window, independent of your organization's fiscal year.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Period start"><Input type="date" value={draft.periodStart} onChange={(e) => set({ periodStart: e.target.value })} /></Field>
          <Field label="Period end"><Input type="date" value={draft.periodEnd} onChange={(e) => set({ periodEnd: e.target.value })} /></Field>
          <Field label="Award amount"><Input type="number" min={0} value={draft.amount} onChange={(e) => set({ amount: Number(e.target.value) })} /></Field>
          <Field label="Grant name" className="sm:col-span-2"><Input value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Shared costs">
            <Select value={draft.allowSplit ? 'yes' : 'no'} onChange={(e) => set({ allowSplit: e.target.value === 'yes' })}>
              <option value="yes">Split allocation permitted</option>
              <option value="no">Not permitted</option>
            </Select>
          </Field>
        </div>
      </Block>

      <Block
        title="Application questions"
        desc="Each funder's questions and word limits. Drafts are trimmed to fit automatically."
        action={editable && <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => set({ questions: [...draft.questions, { id: uid('q'), prompt: '', wordLimit: 250, answer: '', citations: [], status: 'empty', missing: [] }] })}>Add question</Button>}
      >
        <div className="space-y-2">
          {draft.questions.map((q, i) => (
            <div key={q.id} className="flex gap-2 rounded-lg border border-line-2 p-3">
              <span className="mt-2 w-5 text-center text-xs font-semibold text-slate-3">{i + 1}</span>
              <Textarea
                rows={2}
                className="flex-1"
                placeholder="Question prompt"
                value={q.prompt}
                onChange={(e) => set({ questions: draft.questions.map((x) => (x.id === q.id ? { ...x, prompt: e.target.value } : x)) })}
              />
              <div className="w-28">
                <Input
                  type="number"
                  min={10}
                  aria-label="Word limit"
                  value={q.wordLimit}
                  onChange={(e) => set({ questions: draft.questions.map((x) => (x.id === q.id ? { ...x, wordLimit: Number(e.target.value) } : x)) })}
                />
                <span className="mt-1 block text-center text-[11px] text-slate-3">word limit</span>
              </div>
              {editable && (
                <div className="flex flex-col">
                  <button type="button" aria-label="Move up" onClick={() => moveQ(i, -1)} className="rounded p-1 text-slate-3 hover:bg-canvas-2"><ArrowUp size={14} /></button>
                  <button type="button" aria-label="Move down" onClick={() => moveQ(i, 1)} className="rounded p-1 text-slate-3 hover:bg-canvas-2"><ArrowDown size={14} /></button>
                  <button type="button" aria-label="Remove question" onClick={() => set({ questions: draft.questions.filter((x) => x.id !== q.id) })} className="rounded p-1 text-slate-3 hover:bg-bad-soft hover:text-bad"><Trash2 size={14} /></button>
                </div>
              )}
            </div>
          ))}
          {!draft.questions.length && <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-slate-3">No questions yet</p>}
        </div>
      </Block>

      <Block
        title="Approved budget"
        desc="Spending categories the funder approved. Transactions in other categories are flagged as unauthorized."
        action={editable && <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => set({ categories: [...draft.categories, { id: uid('c'), name: '', budget: 0 }] })}>Add category</Button>}
      >
        <div className="overflow-hidden rounded-lg border border-line-2">
          {draft.categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 border-b border-line-2 p-2 last:border-0">
              <Input className="flex-1" placeholder="Category name" value={c.name} onChange={(e) => set({ categories: draft.categories.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) })} />
              <div className="relative w-40">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-3">$</span>
                <Input type="number" min={0} className="pl-6 text-right" value={c.budget} onChange={(e) => set({ categories: draft.categories.map((x) => (x.id === c.id ? { ...x, budget: Number(e.target.value) } : x)) })} />
              </div>
              {editable && (
                <button type="button" aria-label="Remove category" onClick={() => set({ categories: draft.categories.filter((x) => x.id !== c.id) })} className="rounded p-2 text-slate-3 hover:bg-bad-soft hover:text-bad"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between bg-canvas px-4 py-2.5 text-sm">
            <span className="font-medium">Total {money(budgetTotal)} <span className="font-normal text-slate-3">of {money(draft.amount)} award</span></span>
            {diff === 0 ? <StatusPill tone="good">Balanced</StatusPill> : diff > 0 ? <StatusPill tone="warn">{money(diff)} unallocated</StatusPill> : <StatusPill tone="bad">{money(-diff)} over award</StatusPill>}
          </div>
        </div>
      </Block>

      <Block
        title="Deadlines"
        desc="Application and reporting deadlines appear on the home timeline."
        action={editable && <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => set({ deadlines: [...draft.deadlines, { id: uid('d'), label: '', date: draft.periodEnd, kind: 'report' }] })}>Add deadline</Button>}
      >
        <div className="space-y-2">
          {draft.deadlines.map((d) => (
            <div key={d.id} className={clsx('flex flex-wrap items-center gap-2 rounded-lg border border-line-2 p-2', d.done && 'opacity-60')}>
              <Input className="min-w-40 flex-1" placeholder="Label" value={d.label} onChange={(e) => set({ deadlines: draft.deadlines.map((x) => (x.id === d.id ? { ...x, label: e.target.value } : x)) })} />
              <Select className="w-36" value={d.kind} onChange={(e) => set({ deadlines: draft.deadlines.map((x) => (x.id === d.id ? { ...x, kind: e.target.value as typeof d.kind } : x)) })}>
                <option value="application">Application</option>
                <option value="report">Report</option>
                <option value="other">Other</option>
              </Select>
              <Input type="date" className="w-40" value={d.date} onChange={(e) => set({ deadlines: draft.deadlines.map((x) => (x.id === d.id ? { ...x, date: e.target.value } : x)) })} />
              <label className="flex items-center gap-1.5 px-2 text-xs text-slate-2">
                <input type="checkbox" checked={!!d.done} onChange={(e) => set({ deadlines: draft.deadlines.map((x) => (x.id === d.id ? { ...x, done: e.target.checked } : x)) })} /> Done
              </label>
              {editable && <button type="button" aria-label="Remove deadline" onClick={() => set({ deadlines: draft.deadlines.filter((x) => x.id !== d.id) })} className="rounded p-2 text-slate-3 hover:bg-bad-soft hover:text-bad"><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
      </Block>

      <Block title="Funder rules & restrictions" desc="One rule per line. Shown beside the record for everyone working on this grant.">
        <Textarea rows={4} value={draft.rules.join('\n')} onChange={(e) => set({ rules: e.target.value.split('\n') })} placeholder="e.g. Indirect costs capped at 10%" />
      </Block>

      {editable && (
        <div className={clsx('sticky bottom-0 -mx-5 -mb-5 flex items-center gap-2 border-t border-line-2 bg-white/95 px-5 py-3 backdrop-blur transition', dirty ? 'opacity-100' : 'pointer-events-none opacity-0')}>
          <span className="text-sm text-slate-2">You have unsaved changes</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setDraft(grant)}>Discard</Button>
          <Button
            size="sm"
            disabled={draft.periodStart >= draft.periodEnd}
            onClick={() => {
              updateGrant(grant.id, {
                ...draft,
                rules: draft.rules.map((r) => r.trim()).filter(Boolean),
                categories: draft.categories.filter((c) => c.name.trim()),
                questions: draft.questions.filter((q) => q.prompt.trim()),
                deadlines: draft.deadlines.filter((d) => d.label.trim() && d.date),
              })
              notify('Grant configuration saved')
            }}
          >
            Save changes
          </Button>
        </div>
      )}
    </fieldset>
  )
}
