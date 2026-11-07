import clsx from 'clsx'
import Papa from 'papaparse'
import { Download, FileSpreadsheet, Link2, UploadCloud, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button, Modal, Pill } from '@/components/ui'
import { money } from '@grantit/shared/format'
import { downloadFile } from '@/lib/report'
import { useStore } from '@/store'
import type { Transaction } from '@grantit/shared/types'

type Row = Omit<Transaction, 'id'>

const TEMPLATE = `date,vendor,description,account,amount,grant,category
2026-10-30,Brightpath Curriculum Co.,Coping-skills cards for workshops,6400 Program Supplies,1250.00,Safe & Strong School Workshops,Curriculum & Materials
2026-10-31,Payroll,Mentor coordinator – 10/2026 overtime,6000 Salaries,800,Anchor Mentors 2026,Mentor Coordinator
2026-11-01,Sunline Charter Bus,Mentoring outing transportation,6600 Activities,640,,
`

const QB_SAMPLE: Row[] = [
  { date: '2026-11-03', vendor: 'Lingua Bridge Interpreters', description: 'Spanish interpretation – family sessions', account: '6700 Contract Services', amount: 980, allocations: [], reviewed: false, source: 'quickbooks-sample' },
  { date: '2026-11-04', vendor: 'Keystone Evaluation Group', description: 'Fall workshop pre-surveys', account: '6700 Contract Services', amount: 2500, allocations: [], reviewed: false, source: 'quickbooks-sample' },
  { date: '2026-11-05', vendor: 'Zoom', description: 'Video conferencing – annual', account: '7200 Software', amount: 180, allocations: [], reviewed: false, source: 'quickbooks-sample' },
]

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, importTransactions, notify } = useStore()
  const [rows, setRows] = useState<Row[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const reset = () => {
    setRows([])
    setErrors([])
    setFileName('')
  }

  function parse(file: File) {
    setFileName(file.name)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (res) => {
        const errs: string[] = []
        const out: Row[] = []
        res.data.forEach((r, i) => {
          const amount = Number(String(r.amount ?? '').replace(/[$,]/g, ''))
          const date = (r.date ?? '').trim()
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount)) {
            errs.push(`Row ${i + 2}: needs date (YYYY-MM-DD) and numeric amount`)
            return
          }
          const grant = state.grants.find((g) => g.name.toLowerCase() === (r.grant ?? '').trim().toLowerCase())
          out.push({
            date,
            vendor: (r.vendor ?? '').trim(),
            description: (r.description ?? r.memo ?? '').trim(),
            account: (r.account ?? '').trim(),
            amount,
            allocations: grant && r.category?.trim() ? [{ grantId: grant.id, category: r.category.trim(), amount }] : [],
            reviewed: false,
            source: 'csv',
          })
        })
        setRows(out)
        setErrors(errs)
      },
    })
  }

  function commit() {
    importTransactions(rows)
    notify(`Imported ${rows.length} transactions`)
    reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} width={680}>
      <div className="flex items-center justify-between border-b border-line-2 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate">Import transactions</h2>
        <button onClick={() => { reset(); onClose() }} aria-label="Close" className="rounded-full p-1.5 text-slate-2 hover:bg-canvas-2"><X size={18} /></button>
      </div>
      <div className="space-y-5 p-6">
        {!rows.length ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) parse(f) }}
              onClick={() => input.current?.click()}
              className={clsx('flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition', drag ? 'border-link bg-link-soft' : 'border-line hover:border-slate-3 hover:bg-canvas')}
            >
              <UploadCloud size={28} className="text-slate-3" />
              <div className="mt-2 font-medium text-slate">Drop a CSV file or click to browse</div>
              <div className="mt-1 text-xs text-slate-3">Columns: date, vendor, description, account, amount, grant (optional), category (optional)</div>
              <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && parse(e.target.files[0])} />
            </div>
            {errors.length > 0 && <p className="text-sm text-bad">{errors[0]}</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              <button onClick={() => downloadFile('grantit-transactions-template.csv', TEMPLATE)} className="flex items-center gap-3 rounded-xl border border-line-2 p-3 text-left hover:bg-canvas">
                <Download size={18} className="text-slate-2" />
                <span><span className="block text-sm font-medium text-slate">CSV template</span><span className="text-xs text-slate-3">Download example</span></span>
              </button>
              <button onClick={() => { setFileName('QuickBooks sample'); setRows(QB_SAMPLE) }} className="flex items-center gap-3 rounded-xl border border-line-2 p-3 text-left hover:bg-canvas">
                <FileSpreadsheet size={18} className="text-good" />
                <span><span className="block text-sm font-medium text-slate">QuickBooks sample</span><span className="text-xs text-slate-3">Load demo ledger</span></span>
              </button>
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-line-2 p-3 opacity-70">
                <Link2 size={18} className="text-slate-3" />
                <span><span className="block text-sm font-medium text-slate">Connect QuickBooks</span><span className="text-xs text-slate-3">Coming soon</span></span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet size={16} className="text-slate-2" />
              <span className="font-medium text-slate">{fileName}</span>
              <Pill tone="good">{rows.length} ready</Pill>
              {errors.length > 0 && <Pill tone="bad">{errors.length} skipped</Pill>}
              <button onClick={reset} className="ml-auto text-xs text-link hover:underline">Choose another file</button>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-line-2 scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-canvas text-left text-xs font-semibold uppercase text-slate-2">
                  <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Vendor / description</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Assigned</th></tr>
                </thead>
                <tbody className="divide-y divide-line-2">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-2">{r.date}</td>
                      <td className="px-3 py-2"><div className="text-slate">{r.vendor}</div><div className="text-xs text-slate-3">{r.description}</div></td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.amount)}</td>
                      <td className="px-3 py-2">{r.allocations.length ? <Pill tone="info">{r.allocations[0].category}</Pill> : <Pill>Unassigned</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {errors.length > 0 && <ul className="text-xs text-bad">{errors.slice(0, 3).map((e) => <li key={e}>{e}</li>)}</ul>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={reset}>Back</Button>
              <Button onClick={commit}>Import {rows.length} transactions</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
