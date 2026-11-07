import { RotateCcw } from 'lucide-react'
import { Button, Card, Field, Input, PageHeader, Select } from '../components/ui'
import { fiscalYearFor } from '../lib/finance'
import { fmtDate, todayISO } from '../lib/format'
import { useStore } from '../store/AppStore'

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'long' }))

export default function Settings() {
  const { state, setFiscalYearStart, resetDemo, notify } = useStore()
  const fy = fiscalYearFor(todayISO(), state.org.fiscalYearStartMonth)
  return (
    <>
      <PageHeader title="Settings" />
      <div className="max-w-2xl space-y-6">
        <Card title="Organization">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={state.org.name} readOnly /></Field>
            <Field label="EIN"><Input value={state.org.ein} readOnly /></Field>
            <Field label="Fiscal year starts" hint={`Current: ${fy.label.replace('Org fiscal year ', '')} · ${fmtDate(fy.start)} – ${fmtDate(fy.end)}`}>
              <Select value={state.org.fiscalYearStartMonth} onChange={(e) => { setFiscalYearStart(Number(e.target.value)); notify('Fiscal year updated') }}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </Select>
            </Field>
          </div>
          <p className="mt-4 text-xs text-slate-3">Each grant keeps its own funding period; the fiscal year is used for organization-wide views.</p>
        </Card>
        <Card title="Demo data">
          <p className="text-sm text-slate-2">Data is stored in this browser. Reset to restore the sample organization, grants, and ledger.</p>
          <Button variant="danger" className="mt-4" icon={<RotateCcw size={15} />} onClick={() => { resetDemo(); notify('Demo data restored', 'info') }}>
            Reset demo data
          </Button>
        </Card>
      </div>
    </>
  )
}
