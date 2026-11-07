import { Check, Lock, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { FACT_CATEGORIES, FACT_STATUS } from '@/lib/labels'
import { Button, Drawer, Field, Input, Pill, Select, Textarea } from '@/components/ui'
import { fmtDate, relativeDay } from '@grantit/shared/format'
import { can, canApproveFact } from '@grantit/shared/permissions'
import { useStore } from '@/store'
import type { Fact, FactCategory, FactStatus } from '@grantit/shared/types'

export function FactDrawer({ fact, hint, onClose }: { fact: Fact | null | 'new'; hint?: string; onClose: () => void }) {
  const { state, me, saveFact, setFactStatus, deleteFact, notify } = useStore()
  const isNew = fact === 'new'
  const existing = isNew ? null : fact
  const [category, setCategory] = useState<FactCategory>(existing?.category ?? 'program')
  const [title, setTitle] = useState(existing?.title ?? (hint ? hint[0].toUpperCase() + hint.slice(1) : ''))
  const [content, setContent] = useState(existing?.content ?? '')
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? hint ?? '')
  const [source, setSource] = useState(existing?.source ?? '')
  const canEdit = can(me.role, 'fact:edit')
  const canApprove = canApproveFact(me.role, category)
  const valid = title.trim() && content.trim()
  const by = (id?: string) => state.users.find((u) => u.id === id)

  function save(status: FactStatus) {
    saveFact({
      id: existing?.id,
      category,
      title: title.trim(),
      content: content.trim(),
      tags: tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      source: source.trim() || undefined,
      status,
      ...(status === 'approved' ? { approvedBy: me.id, approvedAt: new Date().toISOString().slice(0, 10) } : {}),
    })
    notify(status === 'approved' ? 'Fact saved and approved' : status === 'pending' ? 'Submitted for approval' : 'Draft saved')
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? 'Add organizational fact' : 'Edit fact'}
      width={520}
      footer={
        canEdit && (
          <>
            {canApprove ? (
              <Button disabled={!valid} icon={<Check size={15} />} onClick={() => save('approved')}>Save & approve</Button>
            ) : (
              <Button disabled={!valid} onClick={() => save('pending')}>Submit for approval</Button>
            )}
            <Button variant="secondary" disabled={!valid} onClick={() => save('draft')}>Save as draft</Button>
            {existing && (
              <Button
                variant="danger"
                className="ml-auto"
                icon={<Trash2 size={14} />}
                onClick={() => {
                  deleteFact(existing.id)
                  notify('Fact deleted')
                  onClose()
                }}
              >
                Delete
              </Button>
            )}
          </>
        )
      }
    >
      {existing && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg bg-canvas px-4 py-3 text-xs text-slate-2">
          <Pill tone={FACT_STATUS[existing.status].tone} dot>{FACT_STATUS[existing.status].label}</Pill>
          <span>Updated {relativeDay(existing.updatedAt)} by {by(existing.updatedBy)?.name}</span>
          {existing.approvedBy && <span>· Approved by {by(existing.approvedBy)?.name} on {fmtDate(existing.approvedAt!)}</span>}
          {existing.status === 'approved' && canApprove && (
            <button className="ml-auto text-link hover:underline" onClick={() => { setFactStatus(existing.id, 'pending'); notify('Approval revoked', 'info'); onClose() }}>Revoke approval</button>
          )}
        </div>
      )}
      <fieldset disabled={!canEdit} className="space-y-4">
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as FactCategory)}>
            {FACT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Reading outcomes 2026" /></Field>
        <Field label="Statement" hint="Write one verifiable statement. Drafts quote approved statements — they never invent figures.">
          <Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Students who completed…" />
        </Field>
        <Field label="Tags" hint="Comma separated — help the drafter match questions"><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="outcomes, literacy" /></Field>
        <Field label="Source / evidence"><Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Where can this be verified?" /></Field>
      </fieldset>
      {!canApprove && canEdit && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-3"><Lock size={12} /> Your role can submit this fact; a Director{category !== 'mission' && category !== 'finance' && category !== 'organization' ? ' or Program lead' : ''} approves it.</p>
      )}
    </Drawer>
  )
}
