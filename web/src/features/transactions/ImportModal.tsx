import clsx from 'clsx'
import Papa from 'papaparse'
import { AlertTriangle, Copy, Download, FileSpreadsheet, Link2, UploadCloud, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button, Modal, Pill } from '@/components/ui'
import { allocationCategoryName } from '@grantit/shared/finance'
import { moneyExact } from '@grantit/shared/format'
import { HEADER_ALIASES, prepareImport, type ImportPreview } from '@grantit/shared/import'
import { can } from '@grantit/shared/permissions'
import { downloadFile } from '@/lib/report'
import { useStore } from '@/store'
import type { Transaction } from '@grantit/shared/types'

const TEMPLATE = `date,vendor,description,account,amount,grant,category
2026-10-30,Brightpath Curriculum Co.,Coping-skills cards for workshops,6400 Program Supplies,1250.00,Safe & Strong School Workshops,Curriculum & Materials
2026-10-31,Payroll,Mentor coordinator – 10/2026 overtime,6000 Salaries,800,Anchor Mentors 2026,Mentor Coordinator
2026-11-01,Sunline Charter Bus,Mentoring outing transportation,6650 Activities,640,,
`

/** QuickBooks-style transaction export served from web/public (about 30 rows, incl. a duplicate, a bad row and a refund). */
const QB_SAMPLE_URL = `${import.meta.env.BASE_URL}samples/quickbooks-sample.csv`

const ACCEPTED = (Object.entries(HEADER_ALIASES) as [string, string[]][]).map(([f, a]) => `${f} (${a.join(' / ')})`).join(', ')

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, me, importTransactions, notify } = useStore()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [readError, setReadError] = useState('')
  const [fileName, setFileName] = useState('')
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const allowed = can(me.role, 'finance:import')
  const grantFor = (id: string | null) => state.grants.find((g) => g.id === id)

  const reset = () => {
    setPreview(null)
    setReadError('')
    setFileName('')
  }
  const close = () => {
    reset()
    onClose()
  }

  function load(name: string, text: string, origin: Transaction['origin']) {
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' })
    const p = prepareImport(parsed.data, state.grants, state.transactions, origin, state.programs)
    setFileName(name)
    if (p.missingColumns.length) {
      setPreview(null)
      setReadError(`${name} is missing a ${p.missingColumns.join(' and ')} column. Accepted headers: ${ACCEPTED}.`)
      return
    }
    setReadError('')
    setPreview(p)
  }

  async function loadFile(file: File) {
    load(file.name, await file.text(), 'csv')
  }

  async function loadSample() {
    try {
      const res = await fetch(QB_SAMPLE_URL)
      if (!res.ok) throw new Error(String(res.status))
      load('QuickBooks sample (quickbooks-sample.csv)', await res.text(), 'quickbooks-sample')
    } catch {
      setReadError('Couldn’t load the QuickBooks sample. Download it and drop the file here instead.')
    }
  }

  function commit() {
    if (!preview || !allowed) return
    importTransactions(preview.ready)
    const skipped = preview.duplicates ? `; skipped ${preview.duplicates} duplicate${preview.duplicates === 1 ? '' : 's'}` : ''
    notify(`Imported ${preview.ready.length} transaction${preview.ready.length === 1 ? '' : 's'}${skipped}`)
    close()
  }

  const warnings = preview?.rows.filter((r) => r.warning && !r.duplicate) ?? []

  return (
    <Modal open={open} onClose={close} width={720} label="Import transactions">
      <div className="flex items-center justify-between border-b border-line-2 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate">Import transactions</h2>
        <button onClick={close} aria-label="Close" className="rounded-full p-1.5 text-slate-2 hover:bg-canvas-2"><X size={18} /></button>
      </div>
      <div className="space-y-5 p-6">
        {!preview ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void loadFile(f) }}
              className={clsx('flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition', drag ? 'border-link bg-link-soft' : 'border-line hover:border-slate-3 hover:bg-canvas')}
            >
              <UploadCloud size={28} className="text-slate-3" />
              <button type="button" onClick={() => input.current?.click()} className="mt-2 rounded px-3 py-2 font-medium text-link hover:underline">Choose a CSV file</button>
              <div className="text-sm text-slate-2">Or drop it here</div>
              <div className="mt-1 text-xs text-slate-3">Grantit template or a QuickBooks transaction export (Date, Name, Memo/Description, Account, Amount). Extra columns are ignored.</div>
              <input ref={input} type="file" accept=".csv,text/csv" aria-label="Choose CSV file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadFile(f) }} />
            </div>
            {readError && <p role="alert" className="text-sm text-bad">{readError}</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              <button onClick={() => downloadFile('grantit-transactions-template.csv', TEMPLATE)} className="flex items-center gap-3 rounded-xl border border-line-2 p-3 text-left hover:bg-canvas">
                <Download size={18} className="text-slate-2" />
                <span><span className="block text-sm font-medium text-slate">CSV template</span><span className="text-xs text-slate-3">Download example</span></span>
              </button>
              <div className="flex items-center gap-3 rounded-xl border border-line-2 p-3">
                <FileSpreadsheet size={18} className="shrink-0 text-good" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate">QuickBooks sample</span>
                  <span className="text-xs text-slate-3">
                    <a href={QB_SAMPLE_URL} download="quickbooks-sample.csv" className="text-link hover:underline">Download CSV</a>
                    {' · '}
                    <button type="button" onClick={() => void loadSample()} className="text-link hover:underline">Import it</button>
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-line-2 p-3 opacity-70">
                <Link2 size={18} className="text-slate-3" />
                <span><span className="block text-sm font-medium text-slate">Connect QuickBooks</span><span className="text-xs text-slate-3">Coming soon</span></span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <FileSpreadsheet size={16} className="text-slate-2" />
              <span className="font-medium text-slate">{fileName}</span>
              <Pill tone="good">{preview.ready.length} ready</Pill>
              {preview.duplicates > 0 && <Pill tone="info">{preview.duplicates} duplicate{preview.duplicates === 1 ? '' : 's'} will be skipped</Pill>}
              {preview.errors.length > 0 && <Pill tone="bad">{preview.errors.length} unreadable</Pill>}
              {warnings.length > 0 && <Pill tone="warn">{warnings.length} imported as unassigned</Pill>}
              <button onClick={reset} className="ml-auto text-xs text-link hover:underline">Choose another file</button>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-line-2 scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-canvas text-left text-xs font-semibold uppercase text-slate-2">
                  <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Vendor / description</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Assigned</th></tr>
                </thead>
                <tbody className="divide-y divide-line-2">
                  {preview.rows.map((r) => {
                    const a = r.tx.allocations[0]
                    return (
                      <tr key={r.line} className={clsx(r.duplicate && 'opacity-55')}>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-2">{r.tx.date}</td>
                        <td className="px-3 py-2">
                          <div className="text-slate">{r.tx.vendor}</div>
                          <div className="text-xs text-slate-3">{r.tx.description}</div>
                          {r.warning && !r.duplicate && <div className="mt-0.5 flex items-center gap-1 text-xs text-warn"><AlertTriangle size={12} /> {r.warning}</div>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{moneyExact(r.tx.amount)}</td>
                        <td className="px-3 py-2">
                          {r.duplicate ? <Pill><Copy size={11} /> Already imported</Pill>
                            : a ? <Pill tone="info">{allocationCategoryName(grantFor(a.grantId), a)}</Pill>
                            : <Pill>Auto-assign</Pill>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {preview.errors.length > 0 && (
              <ul role="alert" className="space-y-0.5 text-xs text-bad">
                {preview.errors.slice(0, 4).map((e) => <li key={e}>{e}: skipped</li>)}
                {preview.errors.length > 4 && <li>…and {preview.errors.length - 4} more</li>}
              </ul>
            )}
            {preview.ignoredColumns.length > 0 && <p className="text-xs text-slate-3">Ignored columns: {preview.ignoredColumns.join(', ')}</p>}
            <div className="flex items-center justify-end gap-2">
              {!allowed && <span className="mr-auto text-xs text-slate-3">Only Finance or the Director can import.</span>}
              <Button variant="secondary" onClick={reset}>Back</Button>
              <Button onClick={commit} disabled={!allowed || !preview.ready.length}>
                {preview.ready.length ? `Import ${preview.ready.length} transaction${preview.ready.length === 1 ? '' : 's'}` : 'Nothing new to import'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
