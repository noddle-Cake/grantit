import clsx from 'clsx'
import { ArrowDown, ArrowUp, CheckCircle2, Download, FileUp, Loader2, Lock, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, Field, Input, Select, StatusPill, Textarea } from '@/components/ui'
import type { AwardLetterFields } from '@grantit/shared/award-letter'
import { allocationCountByCategory, categoryByName } from '@grantit/shared/finance'
import { fmtDate, moneyExact, uid } from '@grantit/shared/format'
import { can } from '@grantit/shared/permissions'
import { ADMIN_PROGRAM_ID } from '@grantit/shared/auto-assign'
import { needsSetup, validateSetup } from '@grantit/shared/setup'
import { FUNDED_STAGES } from '@grantit/shared/workspaces'
import { AwardLetterError, extractAwardLetter } from '@/lib/award-letter-ai'
import { useStore } from '@/store'
import type { BudgetCategory, Grant, GrantStage } from '@grantit/shared/types'

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'long' }))
const SAMPLE_LETTER_URL = `${import.meta.env.BASE_URL}samples/family-wellness-award-letter.pdf`

/** Fields the award-letter autofill can fill. */
type AiField = 'amount' | 'periodStart' | 'periodEnd' | 'funderFiscalYearStartMonth' | 'categories'
const AI_FIELDS: AiField[] = ['amount', 'periodStart', 'periodEnd', 'funderFiscalYearStartMonth', 'categories']

function Block({ title, desc, children, action }: { title: string; desc?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-line-2 pb-6 last:border-0 @3xl:grid-cols-[220px_1fr]">
      <div>
        <h4 className="text-sm font-semibold text-slate">{title}</h4>
        {desc && <p className="mt-1 text-xs leading-relaxed text-slate-3">{desc}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

/** Highlight for fields the AI couldn't read from the letter. */
const missingRing = 'ring-2 ring-warn/70 border-warn'

export function SetupTab({ grant }: { grant: Grant }) {
  const { me, state, updateGrant, confirmGrantSetup, reassignUnconfirmed, notify } = useStore()
  const editable = can(me.role, 'grant:configure')
  const [draft, setDraft] = useState<Grant>(grant)
  // Reset the form when the saved grant changes (e.g. after Save), without an effect.
  const [savedGrant, setSavedGrant] = useState(grant)
  const [ai, setAi] = useState<{ filled: AiField[]; missing: AiField[]; problems: string[] } | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  if (savedGrant !== grant) {
    setSavedGrant(grant)
    setDraft(grant)
    setAi(null)
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(grant)
  const set = (patch: Partial<Grant>, touched?: AiField) => {
    setDraft((d) => ({ ...d, ...patch }))
    if (touched && ai?.missing.includes(touched)) setAi({ ...ai, missing: ai.missing.filter((f) => f !== touched) })
  }
  const isMissing = (f: AiField) => !!ai?.missing.includes(f)

  const funded = (FUNDED_STAGES as readonly GrantStage[]).includes(draft.stage)
  const unconfirmed = needsSetup(grant)
  // Confirmed funded grants re-run the setup rules on every save; proposals (apply stages) only need valid dates.
  const strict = funded && (unconfirmed || !!grant.setupConfirmedAt)
  const usage = allocationCountByCategory(grant.id, state.transactions)
  const check = validateSetup({
    amount: draft.amount,
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    categories: draft.categories,
    funderFiscalYearStartMonth: draft.funderFiscalYearStartMonth,
  })
  const categoryIssue = (id: string) => check.issues.find((i) => i.categoryId === id)?.message
  const diff = check.difference

  const moveQ = (i: number, dir: -1 | 1) => {
    const qs = [...draft.questions]
    const j = i + dir
    if (j < 0 || j >= qs.length) return
    ;[qs[i], qs[j]] = [qs[j], qs[i]]
    set({ questions: qs })
  }

  /** Put AI-read values into the form (never saves). Categories keep their ids when the name already exists. */
  function applyLetter(fields: AwardLetterFields, problems: string[]) {
    const patch: Partial<Grant> = {}
    if (fields.amount !== null) patch.amount = fields.amount
    if (fields.periodStart) patch.periodStart = fields.periodStart
    if (fields.periodEnd) patch.periodEnd = fields.periodEnd
    if (fields.funderFiscalYearStartMonth !== null) patch.funderFiscalYearStartMonth = fields.funderFiscalYearStartMonth
    if (fields.categories) {
      const next: BudgetCategory[] = fields.categories.map((c) => {
        const existing = categoryByName(draft, c.name)
        return { ...existing, id: existing?.id ?? uid('c'), name: c.name, budget: c.budget }
      })
      // Categories that already have transactions stay, so nothing is orphaned; validation shows the mismatch.
      const kept = draft.categories.filter((c) => usage.get(c.id) && !next.some((n) => n.id === c.id))
      patch.categories = [...next, ...kept]
    }
    setDraft((d) => ({ ...d, ...patch }))
    const has: Record<AiField, boolean> = {
      amount: fields.amount !== null,
      periodStart: !!fields.periodStart,
      periodEnd: !!fields.periodEnd,
      funderFiscalYearStartMonth: fields.funderFiscalYearStartMonth !== null,
      categories: !!fields.categories,
    }
    setAi({ filled: AI_FIELDS.filter((f) => has[f]), missing: AI_FIELDS.filter((f) => !has[f]), problems })
  }

  async function onLetter(file: File) {
    setAiError('')
    setAiBusy(true)
    try {
      const { fields, problems } = await extractAwardLetter(file)
      applyLetter(fields, problems)
      notify('Award letter read. Review the highlighted fields, then confirm setup.', 'info')
    } catch (e) {
      setAiError(e instanceof AwardLetterError ? e.message : 'Something went wrong reading the letter. Enter the terms by hand.')
    } finally {
      setAiBusy(false)
    }
  }

  function cleaned(): Partial<Grant> {
    const { funderFiscalYearStartMonth: fy, ...rest } = draft
    return {
      ...rest,
      ...(fy ? { funderFiscalYearStartMonth: fy } : {}),
      rules: draft.rules.map((r) => r.trim()).filter(Boolean),
      categories: draft.categories.map((c) => ({ ...c, name: c.name.trim().replace(/\s+/g, ' ') })).filter((c) => c.name),
      questions: draft.questions.filter((q) => q.prompt.trim()),
      deadlines: draft.deadlines.filter((d) => d.label.trim() && d.date),
    }
  }

  function save() {
    const patch = cleaned()
    // updateGrant merges, so an unset funder year has to be removed explicitly.
    if (!patch.funderFiscalYearStartMonth) patch.funderFiscalYearStartMonth = undefined
    if (unconfirmed) {
      confirmGrantSetup(grant.id, patch)
      notify('Setup confirmed. This grant can now receive transactions.')
    } else {
      updateGrant(grant.id, patch)
      reassignUnconfirmed()
      notify('Grant configuration saved')
    }
    setAi(null)
  }

  const canSave = !funded || (strict ? check.ok : draft.periodStart < draft.periodEnd)
  const blockers = !funded ? [] : strict ? check.issues.map((i) => i.message) : draft.periodStart < draft.periodEnd ? [] : ['The period must end after it starts.']
  const defaultFyMonth = Number(draft.periodStart.slice(5, 7)) || 1

  return (
    <fieldset disabled={!editable} className="@container space-y-6">
      {!editable && (
        <div className="flex items-center gap-2 rounded-lg bg-canvas px-4 py-2.5 text-sm text-slate-2">
          <Lock size={14} /> Only the Director can change grant configuration.
        </div>
      )}

      {unconfirmed && (
        <div className="rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-slate">
          <span className="font-medium">Needs setup.</span> Check the award period and budget against the award letter, then choose <span className="font-medium">Confirm setup</span>. Until then, no transactions can be charged to this grant.
        </div>
      )}

      {funded && (
        <Block
          title="Award letter"
          desc="Upload the funder's award letter to fill in the amount, period, funder fiscal year and budget. Nothing is saved until you confirm."
        >
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onLetter(f) }} />
            <Button variant="secondary" size="sm" disabled={!editable || aiBusy} icon={aiBusy ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} onClick={() => fileInput.current?.click()}>
              {aiBusy ? 'Reading award letter…' : 'Upload award letter (PDF)'}
            </Button>
            <a href={SAMPLE_LETTER_URL} download="family-wellness-award-letter.pdf" className="inline-flex items-center gap-1.5 text-sm text-link hover:underline">
              <Download size={14} /> Download sample award letter
            </a>
          </div>
          {aiError && (
            <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad" role="alert">
              {aiError}
              {aiError.includes('Settings') && <> <Link to="/settings" className="font-medium underline">Open Settings</Link></>}
            </p>
          )}
          {ai && (
            <div className="mt-3 rounded-lg border border-link/30 bg-link-soft px-3 py-2.5 text-sm text-slate" role="status">
              <span className="flex items-center gap-1.5 font-medium"><Sparkles size={14} className="text-link" /> AI-extracted — review before confirming</span>
              <span className="mt-0.5 block text-xs text-slate-2">
                Filled: {ai.filled.length ? ai.filled.map(label).join(', ') : 'nothing'}.
                {ai.missing.length > 0 && <> Not stated in the letter (highlighted): {ai.missing.map(label).join(', ')}.</>}
              </span>
            </div>
          )}
        </Block>
      )}

      {!funded && <Block title="Application details" desc="The prospect you're pursuing and the amount you plan to request.">
        <div className="grid gap-4 @xl:grid-cols-2">
          <Field label="Grant name"><Input value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Funder"><Input value={draft.funder} onChange={(e) => set({ funder: e.target.value })} /></Field>
          <Field label="Requested amount"><Input type="number" min={0} step="0.01" value={draft.amount} onChange={(e) => set({ amount: Number(e.target.value) })} /></Field>
        </div>
      </Block>}

      {funded && <Block title="Funding period" desc="Spending is calculated within this window, independent of your organization's fiscal year.">
        <div className="grid gap-4 @xl:grid-cols-3">
          <Field label="Period start"><Input type="date" className={clsx(isMissing('periodStart') && missingRing)} value={draft.periodStart} onChange={(e) => set({ periodStart: e.target.value }, 'periodStart')} /></Field>
          <Field label="Period end"><Input type="date" className={clsx(isMissing('periodEnd') && missingRing)} value={draft.periodEnd} onChange={(e) => set({ periodEnd: e.target.value }, 'periodEnd')} /></Field>
          <Field label="Award amount">
            <Input type="number" min={0} step="0.01" className={clsx(isMissing('amount') && missingRing)} value={draft.amount} onChange={(e) => set({ amount: Number(e.target.value) }, 'amount')} />
          </Field>
          <Field label="Program" hint="Expenses coded to this program can be charged to this grant.">
            <Select value={draft.programId ?? ''} onChange={(e) => set({ programId: e.target.value || undefined })}>
              <option value="">Choose a program</option>
              {state.programs.filter((p) => p.id !== ADMIN_PROGRAM_ID).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Grant name" className="@xl:col-span-2"><Input value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Shared costs">
            <Select value={draft.allowSplit ? 'yes' : 'no'} onChange={(e) => set({ allowSplit: e.target.value === 'yes' })}>
              <option value="yes">Split allocation permitted</option>
              <option value="no">Not permitted</option>
            </Select>
          </Field>
          <Field label="Funder fiscal year starts" className="@xl:col-span-2" hint="Used for funder-year and quarterly views. Defaults to the month the grant starts.">
            <Select
              className={clsx(isMissing('funderFiscalYearStartMonth') && missingRing)}
              value={draft.funderFiscalYearStartMonth ?? ''}
              onChange={(e) => set({ funderFiscalYearStartMonth: e.target.value ? Number(e.target.value) : undefined }, 'funderFiscalYearStartMonth')}
            >
              <option value="">Same as the grant start ({MONTHS[defaultFyMonth - 1]})</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>
        </div>
      </Block>}

      <Block
        title="Application questions"
        desc="Each funder's questions and word limits. Drafts are trimmed to fit automatically."
        action={editable && <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => set({ questions: [...draft.questions, { id: uid('q'), prompt: '', wordLimit: 250, answer: '', citations: [], status: 'empty', missing: [] }] })}>Add question</Button>}
      >
        <div className="space-y-2">
          {draft.questions.map((q, i) => (
            <div key={q.id} className="flex flex-wrap gap-2 rounded-lg border border-line-2 p-3">
              <span className="mt-2 w-5 text-center text-xs font-semibold text-slate-3">{i + 1}</span>
              <Textarea
                rows={2}
                className="min-w-40 flex-1"
                aria-label={`Question ${i + 1} prompt`}
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
                <span className="mt-1 block text-center text-[0.6875rem] text-slate-3">word limit</span>
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

      {funded && <Block
        title="Approved budget"
        desc="Budget lines the funder approved, and the spending category each one pays for. Renaming a line keeps its transactions."
        action={editable && <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => set({ categories: [...draft.categories, { id: uid('c'), name: '', budget: 0 }] }, 'categories')}>Add category</Button>}
      >
        <div className={clsx('overflow-hidden rounded-lg border border-line-2', isMissing('categories') && missingRing)}>
          {draft.categories.map((c) => {
            const used = usage.get(c.id) ?? 0
            const issue = strict ? categoryIssue(c.id) : undefined
            return (
              <div key={c.id} className="border-b border-line-2 p-2 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Input className={clsx('min-w-40 flex-1', issue && 'border-bad')} placeholder="Category name" aria-label="Budget category name" value={c.name} onChange={(e) => set({ categories: draft.categories.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) }, 'categories')} />
                  <Select
                    aria-label={`What ${c.name || 'this line'} pays for`}
                    className="w-44"
                    value={c.acceptedCategoryIds?.[0] ?? ''}
                    onChange={(e) => set({ categories: draft.categories.map((x) => (x.id === c.id ? { ...x, acceptedCategoryIds: e.target.value ? [e.target.value] : [] } : x)) }, 'categories')}
                  >
                    <option value="">Pays for…</option>
                    {state.orgCategories.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </Select>
                  <div className="relative w-28 @sm:w-36">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-3">$</span>
                    <Input type="number" min={0} step="0.01" aria-label="Category budget" className="pl-6 text-right" value={c.budget} onChange={(e) => set({ categories: draft.categories.map((x) => (x.id === c.id ? { ...x, budget: Number(e.target.value) } : x)) }, 'categories')} />
                  </div>
                  {editable && (
                    <button
                      type="button"
                      aria-label={used ? `Can't remove ${c.name}: ${used} transactions use it` : 'Remove category'}
                      title={used ? `Reassign its ${used} transaction${used === 1 ? '' : 's'} on the Spending page first` : 'Remove category'}
                      disabled={used > 0}
                      onClick={() => set({ categories: draft.categories.filter((x) => x.id !== c.id) }, 'categories')}
                      className="rounded p-2 text-slate-3 hover:bg-bad-soft hover:text-bad disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-3"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {(issue || used > 0) && (
                  <p className={clsx('mt-1 px-1 text-xs', issue ? 'text-bad' : 'text-slate-3')}>
                    {issue ?? `${used} transaction${used === 1 ? '' : 's'} charged here. Reassign them before removing this category.`}
                  </p>
                )}
              </div>
            )
          })}
          {!draft.categories.length && <p className="px-4 py-6 text-center text-sm text-slate-3">No categories yet. Add them, or upload the award letter.</p>}
          <div className="flex items-center justify-between bg-canvas px-4 py-2.5 text-sm">
            <span className="font-medium">Total {moneyExact(check.budgetTotal)} <span className="font-normal text-slate-3">of {moneyExact(draft.amount || 0)} award</span></span>
            {diff === 0 && draft.categories.length ? <StatusPill tone="good">Balanced</StatusPill> : diff > 0 ? <StatusPill tone="warn">{moneyExact(diff)} unallocated</StatusPill> : diff < 0 ? <StatusPill tone="bad">{moneyExact(-diff)} over award</StatusPill> : null}
          </div>
        </div>
      </Block>}

      <Block
        title={funded ? "Deadlines" : "Application deadlines"}
        desc={funded ? "Application and reporting deadlines appear on the home timeline." : "Track when this application is due."}
        action={editable && <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => set({ deadlines: [...draft.deadlines, { id: uid('d'), label: '', date: funded ? draft.periodEnd : '', kind: funded ? 'report' : 'application' }] })}>Add deadline</Button>}
      >
        <div className="space-y-2">
          {draft.deadlines.filter((d) => funded || d.kind === 'application').map((d) => (
            <div key={d.id} className={clsx('flex flex-wrap items-center gap-2 rounded-lg border border-line-2 p-2', d.done && 'opacity-60')}>
              <Input aria-label="Deadline label" className="min-w-40 flex-1" placeholder="Label" value={d.label} onChange={(e) => set({ deadlines: draft.deadlines.map((x) => (x.id === d.id ? { ...x, label: e.target.value } : x)) })} />
              {funded && <Select aria-label="Deadline type" className="w-36" value={d.kind} onChange={(e) => set({ deadlines: draft.deadlines.map((x) => (x.id === d.id ? { ...x, kind: e.target.value as typeof d.kind } : x)) })}>
                <option value="application">Application</option>
                <option value="report">Report</option>
                <option value="other">Other</option>
              </Select>}
              <Input aria-label="Deadline date" type="date" className="w-40" value={d.date} onChange={(e) => set({ deadlines: draft.deadlines.map((x) => (x.id === d.id ? { ...x, date: e.target.value } : x)) })} />
              <label className="flex items-center gap-1.5 px-2 text-xs text-slate-2">
                <input type="checkbox" checked={!!d.done} onChange={(e) => set({ deadlines: draft.deadlines.map((x) => (x.id === d.id ? { ...x, done: e.target.checked } : x)) })} /> Done
              </label>
              {editable && <button type="button" aria-label="Remove deadline" onClick={() => set({ deadlines: draft.deadlines.filter((x) => x.id !== d.id) })} className="rounded p-2 text-slate-3 hover:bg-bad-soft hover:text-bad"><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
      </Block>

      <Block title="Funder rules & restrictions" desc="One rule per line. Shown beside the record for everyone working on this grant.">
        <Textarea aria-label="Funder rules and restrictions" rows={4} value={draft.rules.join('\n')} onChange={(e) => set({ rules: e.target.value.split('\n') })} placeholder="e.g. Indirect costs capped at 10%" />
      </Block>

      {grant.setupConfirmedAt && funded && (
        <p className="flex items-center gap-1.5 text-xs text-slate-3"><CheckCircle2 size={13} className="text-good" /> Setup confirmed {fmtDate(grant.setupConfirmedAt)}. Edits are checked against the same rules.</p>
      )}

      {editable && (dirty || unconfirmed) && (
        <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center gap-2 border-t border-line-2 bg-surface/95 px-5 py-3 backdrop-blur">
          <span className="min-w-0 flex-1 text-sm text-slate-2">
            {blockers.length ? <span className="text-bad">{blockers[0]}{blockers.length > 1 && ` (+${blockers.length - 1} more)`}</span> : unconfirmed ? 'Ready to confirm.' : 'You have unsaved changes'}
          </span>
          {dirty && <Button variant="ghost" size="sm" onClick={() => { setDraft(grant); setAi(null) }}>Discard</Button>}
          <Button size="sm" disabled={!canSave || (!dirty && !unconfirmed)} onClick={save}>
            {unconfirmed ? 'Confirm setup' : 'Save changes'}
          </Button>
        </div>
      )}
    </fieldset>
  )
}

function label(f: AiField) {
  return { amount: 'award amount', periodStart: 'period start', periodEnd: 'period end', funderFiscalYearStartMonth: 'funder fiscal year', categories: 'budget categories' }[f]
}
