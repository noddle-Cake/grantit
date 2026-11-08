import { AlertTriangle, Check, Eye, FileText, Lock, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { relativeDay, uid } from '@grantit/shared/format'
import { can, canApproveDoc } from '@grantit/shared/permissions'
import { SOURCE_DOC_KINDS, type SourceDoc, type SourceDocKind } from '@grantit/shared/types'
import { Avatar, Button, Card, Field, Input, Modal, Pill, Select } from '@/components/ui'
import { DOC_KIND_LABEL, FACT_STATUS } from '@/lib/labels'
import { DocStoreError, saveDoc } from '@/lib/doc-store'
import { extractPages, openPdf } from '@/lib/pdf'
import { useStore } from '@/store'

const MAX_BYTES = 25 * 1024 * 1024

const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** Choose a PDF, read its text, and add it to the knowledge base, approved or awaiting approval. */
function UploadModal({ onClose }: { onClose: () => void }) {
  const { me, addSourceDoc, notify } = useStore()
  const [file, setFile] = useState<File>()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SourceDocKind>('report')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const canApprove = canApproveDoc(me.role, kind)

  function choose(f: File | undefined) {
    setError(undefined)
    if (!f) return setFile(undefined)
    if (f.type && f.type !== 'application/pdf') return setError('Choose a PDF file.')
    if (f.size > MAX_BYTES) return setError('That PDF is over 25 MB. Split it or compress it first.')
    setFile(f)
    if (!name.trim()) setName(f.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' '))
  }

  async function upload(status: SourceDoc['status']) {
    if (!file) return
    setBusy(true)
    setError(undefined)
    try {
      const bytes = await file.arrayBuffer()
      let pdf
      try {
        pdf = await openPdf(bytes)
      } catch {
        throw new DocStoreError('This file couldn’t be read as a PDF. It may be damaged or password-protected.')
      }
      const pages = await extractPages(pdf.pdf).finally(pdf.close)
      if (!pages.some((p) => p.trim())) throw new DocStoreError('This PDF has no selectable text (it may be a scan). Drafts can only quote text, so run it through OCR first, then upload it again.')
      const id = uid('doc')
      await saveDoc(id, new Blob([bytes], { type: 'application/pdf' }), pages)
      addSourceDoc({ id, name: name.trim(), fileName: file.name, kind, pages: pages.length, size: file.size, status })
      notify(status === 'approved' ? `Added “${name.trim()}”; drafts can quote it now` : `Uploaded “${name.trim()}” for approval`)
      onClose()
    } catch (e) {
      setError(e instanceof DocStoreError ? e.message : 'Couldn’t read this PDF. Try again, or try another file.')
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} label="Upload a PDF" width={520}>
      <div className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Upload a PDF</h2>
          <p className="mt-1 text-sm text-slate-2">Evaluations, reports, past applications, plans. Once approved, drafts quote it and link each quote to its page.</p>
        </div>
        <Field label="PDF file" hint="Up to 25 MB, with selectable text">
          <input
            type="file"
            accept="application/pdf,.pdf"
            aria-label="PDF file"
            disabled={busy}
            onChange={(e) => choose(e.target.files?.[0])}
            className="block w-full text-sm text-slate-2 file:mr-3 file:rounded-[3px] file:border file:border-accent file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-dark hover:file:bg-brand-soft"
          />
        </Field>
        <Field label="Title"><Input value={name} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2025–26 Program Evaluation" /></Field>
        <Field label="Kind">
          <Select value={kind} disabled={busy} onChange={(e) => setKind(e.target.value as SourceDocKind)}>
            {SOURCE_DOC_KINDS.map((k) => <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>)}
          </Select>
        </Field>
        {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}</p>}
        {!canApprove && <p className="flex items-center gap-1.5 text-xs text-slate-3"><Lock size={12} /> Your role can submit this PDF; a Director{kind === 'financials' ? ' or Finance' : kind === 'evaluation' || kind === 'report' || kind === 'application' ? ' or Program lead' : ''} approves it.</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          {canApprove ? (
            <Button icon={<Check size={15} />} disabled={!file || !name.trim() || busy} onClick={() => upload('approved')}>{busy ? 'Reading PDF…' : 'Upload & approve'}</Button>
          ) : (
            <Button icon={<Upload size={15} />} disabled={!file || !name.trim() || busy} onClick={() => upload('pending')}>{busy ? 'Reading PDF…' : 'Submit for approval'}</Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** The knowledge base's PDFs: the primary source drafts quote, once approved. */
export function DocumentsPanel({ onView }: { onView: (doc: SourceDoc) => void }) {
  const { state, me, setSourceDocStatus, deleteSourceDoc, restoreSourceDoc, notify } = useStore()
  const [uploading, setUploading] = useState(false)
  const docs = state.sourceDocs
  const canEdit = can(me.role, 'fact:edit')
  const waiting = docs.filter((d) => d.status !== 'approved').length

  return (
    <Card
      padded={false}
      title={<span className="flex items-center gap-2">Documents <span className="text-xs font-normal text-slate-3">{plural(docs.length, 'PDF')}{waiting ? ` · ${waiting} awaiting approval` : ''}</span></span>}
      action={canEdit && <Button size="sm" icon={<Upload size={14} />} onClick={() => setUploading(true)}>Upload PDF</Button>}
    >
      {docs.length ? (
        <ul aria-label="Documents" className="divide-y divide-line-2">
          {docs.map((d) => {
            const by = state.users.find((u) => u.id === d.uploadedBy)
            const canApprove = d.status !== 'approved' && canApproveDoc(me.role, d.kind)
            return (
              <li key={d.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                <FileText size={18} className="mt-0.5 shrink-0 text-slate-3" aria-hidden />
                <button type="button" onClick={() => onView(d)} className="group min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-link group-hover:underline">{d.name}</span>
                    <Pill>{DOC_KIND_LABEL[d.kind]}</Pill>
                    <Pill tone={FACT_STATUS[d.status].tone} dot>{FACT_STATUS[d.status].label}</Pill>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-3">
                    <span>{plural(d.pages, 'page')} · {fileSize(d.size)}</span>
                    {by && <span className="flex items-center gap-1.5"><Avatar initials={by.initials} size={16} /> {by.name}</span>}
                    <span>Added {relativeDay(d.uploadedAt)}</span>
                    {d.status !== 'approved' && <span>Not used in drafts until approved</span>}
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  {canApprove && (
                    <Button size="sm" variant="secondary" icon={<Check size={14} />} onClick={() => { setSourceDocStatus(d.id, 'approved'); notify(`Approved “${d.name}”; drafts can quote it now`) }}>Approve</Button>
                  )}
                  {d.status === 'draft' && !canApproveDoc(me.role, d.kind) && canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => { setSourceDocStatus(d.id, 'pending'); notify('Submitted for approval') }}>Submit</Button>
                  )}
                  <Button size="sm" variant="ghost" aria-label={`View ${d.name}`} icon={<Eye size={15} />} onClick={() => onView(d)} />
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${d.name}`}
                      icon={<Trash2 size={15} />}
                      onClick={() => {
                        deleteSourceDoc(d.id)
                        notify(`Deleted “${d.name}”. Answers that quote it keep their text.`, 'info', { label: 'Undo', run: () => restoreSourceDoc(d) })
                      }}
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="px-5 py-8 text-center text-sm text-slate-2">
          No PDFs yet. Upload evaluations, reports and past applications: approved PDFs are the main source drafts quote.
        </div>
      )}
      {uploading && <UploadModal onClose={() => setUploading(false)} />}
    </Card>
  )
}
