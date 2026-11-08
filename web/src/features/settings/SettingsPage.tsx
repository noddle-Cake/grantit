import { KeyRound, Monitor, Moon, Plus, RotateCcw, Sun } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, Field, Input, Modal, PageHeader, Segmented, Select } from '@/components/ui'
import { fiscalYearFor } from '@grantit/shared/finance'
import { fmtDate, todayISO } from '@grantit/shared/format'
import { can } from '@grantit/shared/permissions'
import { clearAiSettings, DEFAULT_AI_MODEL, readAiSettings, writeAiSettings } from '@/lib/ai-settings'
import { type Appearance, readAppearance, writeAppearance } from '@/lib/appearance'
import { useStore } from '@/store'
import type { OrgCategory } from '@grantit/shared/types'

/** One editable name. Commits on blur so a half-typed name never reaches the ledger; a blank restores the old name. */
function CategoryName({ category, onRename }: { category: OrgCategory; onRename: (name: string) => void }) {
  const [name, setName] = useState(category.name)
  return (
    <Input
      aria-label={`Rename ${category.name}`}
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => {
        const next = name.trim()
        if (next && next !== category.name) onRename(next)
        else setName(category.name)
      }}
    />
  )
}

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'long' }))

export default function Settings() {
  const { state, me, setFiscalYearStart, addOrgCategory, renameOrgCategory, resetDemo, notify } = useStore()
  const [resetOpen, setResetOpen] = useState(false)
  const fy = fiscalYearFor(todayISO(), state.org.fiscalYearStartMonth)
  const [ai, setAi] = useState(readAiSettings)
  const [showKey, setShowKey] = useState(false)
  const [appearance, setAppearance] = useState(readAppearance)
  const [newCategory, setNewCategory] = useState('')
  const canEditCategories = can(me.role, 'finance:review')
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
        <Card title="Spending categories">
          <p className="text-sm text-slate-2">Your chart of accounts. Every expense is coded to one of these, whatever each grant calls its budget lines.</p>
          <fieldset disabled={!canEditCategories} className="mt-4 grid gap-2 sm:grid-cols-2">
            {state.orgCategories.map((c) => <CategoryName key={c.id} category={c} onRename={(name) => renameOrgCategory(c.id, name)} />)}
          </fieldset>
          {canEditCategories && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => { e.preventDefault(); if (newCategory.trim()) { addOrgCategory(newCategory.trim()); setNewCategory('') } }}
            >
              <Input aria-label="New category" placeholder="New category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              <Button type="submit" variant="secondary" icon={<Plus size={15} />} disabled={!newCategory.trim()}>Add</Button>
            </form>
          )}
        </Card>
        <Card title="Appearance">
          <p className="text-sm text-slate-2">Use light or dark, or follow this device. Saved in this browser; Reset doesn't change it.</p>
          <div className="mt-4">
            <Segmented<Appearance>
              label="Appearance"
              value={appearance}
              onChange={(v) => { writeAppearance(v); setAppearance(v) }}
              options={[
                { id: 'system', label: <><Monitor size={14} aria-hidden />System</> },
                { id: 'light', label: <><Sun size={14} aria-hidden />Light</> },
                { id: 'dark', label: <><Moon size={14} aria-hidden />Dark</> },
              ]}
            />
          </div>
        </Card>
        <Card title="AI award-letter reading">
          <p className="text-sm text-slate-2">
            Grant Setup can read an award letter PDF with OpenAI and fill in the amount, period and budget for you to review.
            The key is stored only in this browser and sent directly to OpenAI; it isn't part of the demo data and Reset doesn't clear it.
          </p>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => { e.preventDefault(); writeAiSettings(ai); setAi(readAiSettings()); notify(ai.apiKey.trim() ? 'AI settings saved in this browser' : 'Model saved; add a key to use AI') }}
          >
            <Field label="OpenAI API key" className="sm:col-span-2" hint={<button type="button" className="text-link hover:underline" onClick={() => setShowKey((v) => !v)}>{showKey ? 'Hide key' : 'Show key'}</button>}>
              <Input type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} placeholder="sk-…" value={ai.apiKey} onChange={(e) => setAi({ ...ai, apiKey: e.target.value })} />
            </Field>
            <Field label="Model" hint={`Default: ${DEFAULT_AI_MODEL}. Needs PDF input and structured outputs.`}>
              <Input spellCheck={false} value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} />
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" icon={<KeyRound size={15} />}>Save</Button>
              <Button type="button" variant="secondary" onClick={() => { clearAiSettings(); setAi(readAiSettings()); notify('AI settings removed from this browser', 'info') }}>Remove key</Button>
            </div>
          </form>
        </Card>
        <Card title="Demo data">
          <p className="text-sm text-slate-2">Data is stored in this browser. Reset to restore the sample organization, grants, and ledger.</p>
          <Button variant="danger" className="mt-4" icon={<RotateCcw size={15} />} onClick={() => setResetOpen(true)}>
            Reset demo data
          </Button>
        </Card>
      </div>
      <Modal open={resetOpen} onClose={() => setResetOpen(false)} label="Reset demo data" width={440}>
        <div className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">Reset demo data?</h2>
          <p className="text-sm text-slate-2">This replaces the facts, grants, spending, and settings saved in this browser with the sample data. Your changes cannot be recovered.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => { resetDemo(); setResetOpen(false); notify('Demo data restored', 'info') }}>Reset demo data</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
