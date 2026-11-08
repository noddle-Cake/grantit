import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleCheck, CircleX, Download, FileText, Lock, Minus, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { findQuote, itemSpans, joinItems } from '@grantit/shared/pdf-text'
import { fmtDate } from '@grantit/shared/format'
import type { DocCitation, SourceDoc } from '@grantit/shared/types'
import { Button, Dialog, Pill } from '@/components/ui'
import { DocStoreError, loadBytes } from '@/lib/doc-store'
import { openPdf, pageItems, pdfjs, type OpenPdf } from '@/lib/pdf'
import { useStore } from '@/store'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

const ZOOMS = [0.75, 1, 1.25, 1.5, 2]

/** One page drawn to fit the available width (times `zoom`), with `quote` highlighted where it's found. */
function PdfPage({ pdf, page, zoom, quote, onFound }: { pdf: OpenPdf['pdf']; page: number; zoom: number; quote?: string; onFound: (found: boolean | null) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const firstMark = useRef<HTMLSpanElement>(null)
  const [width, setWidth] = useState(0)
  const [size, setSize] = useState<{ w: number; h: number }>()
  const [marks, setMarks] = useState<Rect[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => setWidth(Math.max(240, el.clientWidth - 32))
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])

  useEffect(() => {
    if (!width || !canvas.current) return
    let cancelled = false
    let render: { cancel: () => void } | undefined
    void (async () => {
      const p = await pdf.getPage(page)
      const scale = (width / p.getViewport({ scale: 1 }).width) * zoom
      const viewport = p.getViewport({ scale })
      const dpr = window.devicePixelRatio || 1
      const c = canvas.current
      if (cancelled || !c) return
      c.width = Math.floor(viewport.width * dpr)
      c.height = Math.floor(viewport.height * dpr)
      const task = p.render({ canvas: c, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] })
      render = task
      await task.promise
      if (cancelled) return
      setSize({ w: viewport.width, h: viewport.height })

      if (!quote) return onFound(null)
      const items = await pageItems(p)
      const joined = joinItems(items)
      const ranges = findQuote(joined.text, quote)
      if (cancelled) return
      if (!ranges) {
        setMarks([])
        return onFound(false)
      }
      const { Util } = await pdfjs()
      setMarks(
        itemSpans(joined, items, ranges).map(({ item, from, to }) => {
          const it = items[item]
          const tx = Util.transform(viewport.transform, it.transform)
          const h = Math.hypot(tx[2], tx[3])
          const w = it.width * scale
          const len = it.str.length || 1
          return { left: tx[4] + (w * from) / len, top: tx[5] - h * 0.95, width: (w * (to - from)) / len, height: h * 1.25 }
        }),
      )
      onFound(true)
    })().catch(() => {
      if (!cancelled) {
        setError(true)
        onFound(null)
      }
    })
    return () => {
      cancelled = true
      render?.cancel()
    }
  }, [pdf, page, zoom, quote, width, onFound])

  useEffect(() => {
    if (marks.length) firstMark.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [marks])

  return (
    <div ref={wrap} className="min-h-0 flex-1 overflow-auto bg-canvas-2 p-4">
      {error && <p role="alert" className="mb-3 rounded-lg bg-warn-soft p-3 text-sm text-warn">This page couldn’t be rendered. Try another page or download the PDF to check the quote.</p>}
      <div className="relative mx-auto bg-white shadow-md" style={size ? { width: size.w, height: size.h } : { width: '100%', aspectRatio: '8.5 / 11' }}>
        <canvas ref={canvas} aria-label={`Page ${page}`} role="img" style={size ? { width: size.w, height: size.h } : { width: '100%', height: '100%' }} />
        {quote &&
          marks.map((r, i) => (
            <span
              key={i}
              ref={i === 0 ? firstMark : undefined}
              aria-hidden
              className="pointer-events-none absolute rounded-[2px] bg-[#ffd400]/45 mix-blend-multiply ring-1 ring-[#e0a800]/70"
              style={{ left: r.left - 1, top: r.top, width: r.width + 2, height: r.height }}
            />
          ))}
      </div>
    </div>
  )
}

export interface CitationReview {
  items: DocCitation[]
  index: number
  canCheck: boolean
  onCheck: (c: DocCitation, ok: boolean | null) => void
}

/**
 * A knowledge-base PDF in a large dialog. Given citations, it opens each one on its page with the quote
 * highlighted, beside the answer sentence it supports, so a reviewer can mark it correct or wrong.
 */
export function PdfViewer({ doc: initialDoc, page: initialPage = 1, review, onClose }: { doc?: SourceDoc; page?: number; review?: CitationReview; onClose: () => void }) {
  const { state } = useStore()
  const [index, setIndex] = useState(review?.index ?? 0)
  const citation = review?.items[index]
  const doc = citation ? state.sourceDocs.find((d) => d.id === citation.docId) : initialDoc
  const [page, setPage] = useState(citation?.page ?? initialPage)
  const [zoom, setZoom] = useState(1)
  const [file, setFile] = useState<{ docId: string; open: OpenPdf; url: string }>()
  const [failure, setFailure] = useState<{ docId: string; message: string }>()
  const [highlight, setHighlight] = useState<{ docId?: string; page: number; quote?: string; found: boolean | null }>()
  const error = failure && failure.docId === doc?.id ? failure.message : undefined

  /** Step to another citation, showing the page its quote is on. */
  const move = (delta: number) => {
    if (!review) return
    const next = Math.min(review.items.length - 1, Math.max(0, index + delta))
    setIndex(next)
    setPage(review.items[next].page)
  }

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    let opened: { open: OpenPdf; url: string } | undefined
    void (async () => {
      try {
        const bytes = await loadBytes(doc)
        if (cancelled) return
        const open = await openPdf(bytes)
        if (cancelled) {
          open.close()
          return
        }
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        opened = { open, url }
        setFile({ docId: doc.id, open, url })
      } catch (e) {
        if (!cancelled) setFailure({ docId: doc.id, message: e instanceof DocStoreError ? e.message : `Couldn’t open “${doc.name}”. The file may be damaged.` })
      }
    })()
    return () => {
      cancelled = true
      if (opened) {
        opened.open.close()
        URL.revokeObjectURL(opened.url)
      }
    }
  }, [doc])

  const pdf = file?.docId === doc?.id ? file?.open.pdf : undefined
  const pages = pdf?.numPages ?? doc?.pages ?? 1
  const quote = citation && page === citation.page ? citation.quote : undefined
  const found = highlight?.docId === doc?.id && highlight?.page === page && highlight?.quote === quote ? highlight?.found ?? null : null
  const onFound = useCallback((value: boolean | null) => setHighlight({ docId: doc?.id, page, quote, found: value }), [doc?.id, page, quote])
  const zi = ZOOMS.indexOf(zoom)

  return (
    <Dialog open onClose={onClose} label={citation ? 'Check citation' : (doc?.name ?? 'PDF')} className="items-center justify-center p-2 sm:p-4">
      <div className="animate-pop-in flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-line-2 px-4 py-3 sm:px-5">
          <FileText size={18} className="shrink-0 text-slate-3" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[0.9375rem] font-semibold text-slate">{doc?.name ?? 'Document not found'}</h2>
            {doc && <p className="truncate text-xs text-slate-3">{doc.fileName}</p>}
          </div>
          {file?.docId === doc?.id && file && (
            <a href={file.url} download={doc?.fileName} className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-link hover:bg-canvas sm:flex">
              <Download size={15} aria-hidden /> Download
            </a>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-2 hover:bg-canvas">
            <X size={18} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {review && citation && (
            <aside aria-label="Citation" className="scrollbar-thin max-h-[45%] shrink-0 overflow-y-auto border-b border-line-2 p-4 sm:p-5 lg:order-last lg:max-h-none lg:w-[22rem] lg:border-b-0 lg:border-l">
              <CitationPanel
                citation={citation}
                doc={doc}
                index={index}
                total={review.items.length}
                found={quote ? found : null}
                canCheck={review.canCheck}
                onMove={move}
                onCheck={(ok) => review.onCheck(citation, ok)}
                onShowPage={() => setPage(citation.page)}
                showingOtherPage={page !== citation.page}
              />
            </aside>
          )}

          <section aria-label="PDF" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line-2 px-3 py-2">
              <Button size="sm" variant="ghost" aria-label="Previous page" icon={<ChevronLeft size={16} />} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} />
              <span className="text-sm tabular-nums text-slate-2" aria-live="polite">Page {page} of {pages}</span>
              <Button size="sm" variant="ghost" aria-label="Next page" icon={<ChevronRight size={16} />} disabled={page >= pages} onClick={() => setPage((p) => p + 1)} />
              <span className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" aria-label="Zoom out" icon={<Minus size={15} />} disabled={zi <= 0} onClick={() => setZoom(ZOOMS[zi - 1])} />
                <span className="w-11 text-center text-xs tabular-nums text-slate-3">{Math.round(zoom * 100)}%</span>
                <Button size="sm" variant="ghost" aria-label="Zoom in" icon={<Plus size={15} />} disabled={zi >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[zi + 1])} />
              </span>
            </div>
            {error || !doc ? (
              <div role="alert" className="m-6 flex items-start gap-2.5 rounded-lg bg-warn-soft p-4 text-sm text-warn">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error ?? 'This document was deleted from the knowledge base.'}
              </div>
            ) : pdf ? (
              <PdfPage key={`${doc?.id}:${page}:${zoom}:${quote ?? ''}`} pdf={pdf} page={Math.min(page, pdf.numPages)} zoom={zoom} quote={quote} onFound={onFound} />
            ) : (
              <div role="status" className="flex flex-1 items-center justify-center text-sm text-slate-3">Opening PDF…</div>
            )}
          </section>
        </div>
      </div>
    </Dialog>
  )
}

function CitationPanel({ citation, doc, index, total, found, canCheck, onMove, onCheck, onShowPage, showingOtherPage }: {
  citation: DocCitation
  doc?: SourceDoc
  index: number
  total: number
  /** Whether the highlight was drawn on the page shown: null while loading or when another page is shown. */
  found: boolean | null
  canCheck: boolean
  onMove: (delta: number) => void
  onCheck: (ok: boolean | null) => void
  onShowPage: () => void
  showingOtherPage: boolean
}) {
  const { state } = useStore()
  const checker = citation.check && state.users.find((u) => u.id === citation.check!.by)
  const notFound = !citation.verified || found === false

  return (
    <div className="space-y-4">
      {total > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-3">Citation {index + 1} of {total}</span>
          <span className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" aria-label="Previous citation" icon={<ChevronLeft size={15} />} disabled={index === 0} onClick={() => onMove(-1)} />
            <Button size="sm" variant="ghost" aria-label="Next citation" icon={<ChevronRight size={15} />} disabled={index === total - 1} onClick={() => onMove(1)} />
          </span>
        </div>
      )}

      <div>
        <div className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-3">The answer says</div>
        <p className="text-sm leading-relaxed text-slate">{citation.claim}</p>
      </div>

      <div>
        <div className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-3">
          Quoted from {doc ? `“${doc.name}”` : 'a deleted document'}, page {citation.page}
        </div>
        <blockquote className="rounded-lg border-l-4 border-[#e0a800] bg-warn-soft px-3 py-2 text-sm leading-relaxed text-slate">{citation.quote}</blockquote>
        {showingOtherPage && (
          <button type="button" className="mt-1.5 text-xs text-link hover:underline" onClick={onShowPage}>Back to page {citation.page}</button>
        )}
      </div>

      {notFound ? (
        <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          This quote wasn’t found word for word in the PDF. Read the page and decide whether it supports the sentence.
        </p>
      ) : found === true && !showingOtherPage ? (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-good">
          <Check size={14} className="mt-0.5 shrink-0" />
          Found word for word on page {citation.page} and highlighted. Check that it supports the sentence.
        </p>
      ) : (
        <p role="status" className="text-xs leading-relaxed text-slate-3">{showingOtherPage ? 'Return to the cited page to see the highlighted quote.' : 'Waiting for the PDF highlight. Check the quote against the page before reviewing.'}</p>
      )}

      <div className="border-t border-line-2 pt-4">
        <div className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-3">Your review</div>
        {citation.check && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-2">
            <Pill tone={citation.check.ok ? 'good' : 'bad'} dot>{citation.check.ok ? 'Supports the sentence' : 'Doesn’t support it'}</Pill>
            <span>{checker?.name ?? 'Someone'} · {fmtDate(citation.check.at)}</span>
            {canCheck && <button type="button" className="text-link hover:underline" onClick={() => onCheck(null)}>Clear</button>}
          </div>
        )}
        {canCheck ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={citation.check?.ok === true ? 'primary' : 'secondary'} icon={<CircleCheck size={15} />} aria-pressed={citation.check?.ok === true} onClick={() => onCheck(true)}>
              Supports it
            </Button>
            <Button size="sm" variant={citation.check?.ok === false ? 'danger' : 'secondary'} icon={<CircleX size={15} />} aria-pressed={citation.check?.ok === false} onClick={() => onCheck(false)}>
              Doesn’t support it
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-slate-3"><Lock size={12} /> Writers and approvers review citations.</p>
        )}
        {citation.check?.ok === false && <p className="mt-3 text-xs leading-relaxed text-slate-2">Edit the sentence or regenerate the answer. The application can’t be marked ready while a citation is marked wrong.</p>}
      </div>
    </div>
  )
}
