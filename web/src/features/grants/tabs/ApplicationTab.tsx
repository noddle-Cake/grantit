import clsx from 'clsx'
import { AlertOctagon, AlertTriangle, BookOpenCheck, Check, CheckCircle2, ClipboardCheck, Copy, Hourglass, Lock, Plus, RefreshCw, Sparkles, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ANSWER_STATUS } from '@/lib/labels'
import { Button, EmptyState, Pill, StatusPill } from '@/components/ui'
import { checkApplication, draftAnswerAsync, findUnsupportedClaims, newlyCovered } from '@grantit/shared/drafting'
import { wordCount } from '@grantit/shared/format'
import { can } from '@grantit/shared/permissions'
import { useStore } from '@/store'
import type { Grant, Question } from '@grantit/shared/types'

function WordMeter({ count, limit }: { count: number; limit: number }) {
  const over = count > limit
  const ratio = Math.min(count / limit, 1)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-viz-track">
        <div className={clsx('h-full rounded-full', over ? 'bg-bad' : ratio > 0.9 ? 'bg-viz-warn' : 'bg-viz-1')} style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className={clsx('text-xs tabular-nums', over ? 'font-semibold text-bad' : 'text-slate-2')}>
        {count} / {limit} words
      </span>
    </div>
  )
}

function QuestionCard({ grant, q, index }: { grant: Grant; q: Question; index: number }) {
  const { state, me, updateQuestion, notify } = useStore()
  const [busy, setBusy] = useState(false)
  const canDraft = can(me.role, 'application:draft')
  const canApprove = can(me.role, 'application:approve')
  const words = wordCount(q.answer)
  const over = words > q.wordLimit
  const unsupported = findUnsupportedClaims(q.answer, state.facts)
  const citedFacts = q.citations.map((id) => state.facts.find((f) => f.id === id)).filter((f) => f !== undefined)
  const unapprovedCited = citedFacts.filter((f) => f.status !== 'approved')
  // Gaps the last draft reported that approved facts now cover: the writer's cue to regenerate.
  const covered = q.status === 'approved' ? [] : newlyCovered(q, state.facts)
  const stillMissing = q.missing.filter((label) => !covered.includes(label))
  const [blocked, setBlocked] = useState<string[]>([])

  async function generate() {
    setBusy(true)
    const r = await draftAnswerAsync(q, state.facts)
    setBusy(false)
    setBlocked(r.blockedBy)
    updateQuestion(grant.id, q.id, { answer: r.text, citations: r.citations, missing: r.missing, status: r.text ? 'draft' : 'empty' })
    notify(r.text ? `Draft generated from ${r.citations.length} approved fact${r.citations.length === 1 ? '' : 's'}` : 'Not enough approved information to draft this answer', r.text ? 'success' : 'error')
  }

  const blockedFacts = blocked.map((id) => state.facts.find((f) => f.id === id)).filter((f) => f && f.status !== 'approved')

  return (
    <article id={`q-${q.id}`} tabIndex={-1} aria-label={`Question ${index + 1}`} className={clsx('scroll-mt-24 rounded-xl border bg-surface transition', q.status === 'approved' ? 'border-good/40' : 'border-line-2')}>
      <header className="flex flex-wrap items-start gap-3 px-5 pt-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canvas-2 text-xs font-semibold text-slate-2">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <h4 className="text-[0.9375rem] font-medium leading-snug text-slate">{q.prompt}</h4>
          <div className="mt-1 text-xs text-slate-3">Limit {q.wordLimit} words</div>
        </div>
        <Pill tone={ANSWER_STATUS[q.status].tone} dot>{ANSWER_STATUS[q.status].label}</Pill>
      </header>

      <div className="px-5 py-4">
        {busy ? (
          <div role="status" aria-live="polite" className="space-y-2.5 rounded-lg border border-line-2 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-2"><Sparkles size={14} className="text-brand" /> Drafting from approved knowledge…</div>
            {[92, 100, 85, 60].map((w) => <div key={w} className="shimmer h-3 rounded" style={{ width: `${w}%` }} />)}
          </div>
        ) : q.status === 'empty' && !q.answer ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line bg-gradient-to-br from-brand-soft/60 via-surface to-link-soft/50 p-5 sm:flex-row sm:items-center">
            <Sparkles className="text-brand" size={20} />
            <p className="flex-1 text-sm text-slate-2">Generate a first draft using only approved organizational facts. Every sentence will cite its source.</p>
            {canDraft ? (
              <Button size="sm" icon={<Sparkles size={14} />} onClick={generate}>Generate draft</Button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-slate-3"><Lock size={12} /> Drafting requires Director or Program role</span>
            )}
          </div>
        ) : (
          <textarea
            aria-label={`Answer to question ${index + 1}: ${q.prompt}`}
            value={q.answer}
            readOnly={!canDraft || q.status === 'approved'}
            onChange={(e) => updateQuestion(grant.id, q.id, { answer: e.target.value, status: 'draft' })}
            rows={Math.max(4, Math.ceil(words / 14))}
            className={clsx(
              'w-full resize-y rounded-lg border bg-surface px-4 py-3 text-[0.875rem] leading-relaxed text-slate focus:ring-2',
              over ? 'border-bad/60 focus:ring-bad/20' : 'border-control-line focus:border-link focus:ring-link/20',
              q.status === 'approved' && 'bg-canvas',
            )}
          />
        )}

        {!busy && q.answer && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <WordMeter count={words} limit={q.wordLimit} />
            {over && <span className="text-xs text-bad">Shorten by {words - q.wordLimit} words before approving</span>}
          </div>
        )}

        {/* Sources */}
        {!busy && citedFacts.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-3">Supported by</div>
            <div className="flex flex-wrap gap-1.5">
              {citedFacts.map((f) => (
                <Link
                  key={f.id}
                  to={`/apply/knowledge?fact=${f.id}`}
                  title={f.content}
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:shadow-sm',
                    f.status === 'approved' ? 'border-good/30 bg-good-soft text-good' : 'border-warn-line bg-warn-soft text-warn',
                  )}
                >
                  <BookOpenCheck size={12} /> {f.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Issues */}
        {!busy && (covered.length > 0 || stillMissing.length > 0 || unsupported.length > 0 || blockedFacts.length > 0 || unapprovedCited.length > 0) && (
          <div className="mt-4 space-y-2">
            {covered.length > 0 && (
              <div role="status" className="flex flex-wrap items-center gap-2.5 rounded-lg bg-good-soft px-3.5 py-2.5 text-sm">
                <Sparkles size={16} className="shrink-0 text-good" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-slate">New approved facts cover {covered.join(', ')}.</span>{' '}
                  <span className="text-slate-2">{canDraft ? 'Regenerate to use them.' : 'A writer can regenerate this answer to use them.'}</span>
                </div>
                {canDraft && <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} onClick={generate}>Regenerate with new facts</Button>}
              </div>
            )}
            {stillMissing.length > 0 && (
              <div className="flex gap-2.5 rounded-lg bg-warn-soft px-3.5 py-2.5 text-sm">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
                <div className="flex-1">
                  <span className="font-medium text-slate">Missing information — not invented.</span>{' '}
                  <span className="text-slate-2">No approved facts cover: {stillMissing.join(', ')}.</span>{' '}
                  <Link to={`/apply/knowledge?new=1&hint=${encodeURIComponent(stillMissing[0])}`} className="whitespace-nowrap font-medium text-link hover:underline">Add a fact →</Link>
                </div>
              </div>
            )}
            {blockedFacts.length > 0 && (
              <div className="flex gap-2.5 rounded-lg bg-link-soft px-3.5 py-2.5 text-sm">
                <Hourglass size={16} className="mt-0.5 shrink-0 text-link" />
                <div className="text-slate-2">
                  Related facts awaiting approval were left out:{' '}
                  {blockedFacts.map((f, i) => (
                    <span key={f!.id}>{i > 0 && ', '}<Link className="font-medium text-link hover:underline" to={`/apply/knowledge?fact=${f!.id}`}>{f!.title}</Link></span>
                  ))}
                </div>
              </div>
            )}
            {unapprovedCited.length > 0 && (
              <div className="flex gap-2.5 rounded-lg bg-warn-soft px-3.5 py-2.5 text-sm text-slate-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
                A cited fact is no longer approved ({unapprovedCited.map((f) => f.title).join(', ')}). Regenerate or re-approve it.
              </div>
            )}
            {unsupported.map((u) => (
              <div key={u.sentence} className="flex gap-2.5 rounded-lg bg-bad-soft px-3.5 py-2.5 text-sm">
                <AlertOctagon size={16} className="mt-0.5 shrink-0 text-bad" />
                <div>
                  <span className="font-medium text-slate">Unsupported claim.</span> <span className="text-slate-2">{u.reason}:</span>
                  <div className="mt-1 italic text-slate-2">“{u.sentence}”</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {q.answer && !busy && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-line-2 bg-canvas/60 px-5 py-3">
          {canDraft && q.status !== 'approved' && (
            <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={generate}>Regenerate</Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={<Copy size={13} />}
            onClick={() => {
              navigator.clipboard?.writeText(q.answer)
              notify('Answer copied')
            }}
          >
            Copy
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {q.status === 'approved' ? (
              <>
                <span className="flex items-center gap-1 text-xs text-good"><CheckCircle2 size={14} /> Approved</span>
                {canApprove && (
                  <Button variant="ghost" size="sm" icon={<Undo2 size={13} />} onClick={() => updateQuestion(grant.id, q.id, { status: 'draft' })}>Reopen</Button>
                )}
              </>
            ) : canApprove ? (
              <Button
                size="sm"
                icon={<Check size={14} />}
                disabled={over || unsupported.length > 0 || !q.answer.trim()}
                title={over ? 'Over word limit' : unsupported.length ? 'Resolve unsupported claims first' : undefined}
                onClick={() => {
                  updateQuestion(grant.id, q.id, { status: 'approved' })
                  notify('Answer approved')
                }}
              >
                Approve answer
              </Button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-slate-3"><Lock size={12} /> Director approves answers</span>
            )}
          </div>
        </footer>
      )}
    </article>
  )
}

export function ApplicationTab({ grant }: { grant: Grant }) {
  const { state, me } = useStore()
  const check = checkApplication(grant.questions, state.facts)
  const { hash } = useLocation()

  // Links from Applications and Home land on the question that needs work (#q-<id>).
  useEffect(() => {
    if (!hash.startsWith('#q-')) return
    const el = document.getElementById(hash.slice(1))
    el?.scrollIntoView?.({ block: 'start' })
    el?.focus({ preventScroll: true })
  }, [hash])

  if (!grant.questions.length)
    return (
      <EmptyState
        icon={<ClipboardCheck />}
        title="No application questions yet"
        action={can(me.role, 'grant:configure') && <Link to="?tab=setup"><Button size="sm" icon={<Plus size={14} />}>Add questions</Button></Link>}
      >
        Add this funder's questions and word limits in setup, then draft answers from your knowledge base.
      </EmptyState>
    )

  const items = [
    { n: check.unanswered, label: 'unanswered' },
    { n: check.overLimit, label: 'over word limit' },
    { n: check.unsupported, label: 'unsupported claims' },
    { n: check.unapproved, label: 'awaiting approval' },
  ]

  return (
    <div className="space-y-4">
      <div className={clsx('flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl px-4 py-3', check.ready ? 'bg-good-soft' : 'bg-canvas')}>
        {check.ready ? (
          <StatusPill tone="good">Application ready — all answers approved and within limits</StatusPill>
        ) : (
          <>
            <span className="text-sm font-semibold text-slate">To finish</span>
            {items.filter((it) => it.n > 0).map((it) => (
              <span key={it.label} className="flex items-center gap-1.5 text-sm text-slate">
                <AlertTriangle size={14} className={it.label.includes('unsupported') || it.label.includes('limit') ? 'text-bad' : 'text-warn'} />
                <span className="tabular-nums font-medium">{it.n}</span> {it.label}
              </span>
            ))}
          </>
        )}
      </div>
      {grant.questions.map((q, i) => (
        <QuestionCard key={q.id} grant={grant} q={q} index={i} />
      ))}
    </div>
  )
}
