import clsx from 'clsx'
import { Building2, CalendarRange, CircleDollarSign, Flag, Shuffle, X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { STAGES } from '@/lib/labels'
import { Button, Modal } from '@/components/ui'
import { uid } from '@grantit/shared/format'
import { workspaceOf } from '@grantit/shared/workspaces'
import { useStore } from '@/store'
import type { GrantStage } from '@grantit/shared/types'

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-3 rounded-xl bg-canvas px-3.5 py-2.5 sm:grid-cols-[1rem_7rem_minmax(0,1fr)]">
      <span className="text-slate-3">{icon}</span>
      <span className="text-[0.8125rem] text-slate-2">{label}</span>
      <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">{children}</div>
    </div>
  )
}

const bare = 'w-full min-w-0 bg-transparent text-sm text-slate placeholder:text-slate-3'

/** Luma-style "create" sheet: cover, big title, compact property rows. */
export function NewGrantModal({ open, onClose, defaultStage = 'prospect' }: { open: boolean; onClose: () => void; defaultStage?: GrantStage }) {
  const { createGrant, me, notify } = useStore()
  const nav = useNavigate()
  const [year] = useState(() => new Date().getFullYear() + 1)
  const [cover, setCover] = useState(() => Math.floor(Math.random() * 6))
  const [name, setName] = useState('')
  const [funder, setFunder] = useState('')
  const [amount, setAmount] = useState('')
  const [start, setStart] = useState(`${year}-01-01`)
  const [end, setEnd] = useState(`${year}-12-31`)
  const [deadline, setDeadline] = useState('')
  const [stage, setStage] = useState<GrantStage>(defaultStage)
  const funded = workspaceOf(defaultStage) === 'funds'

  const validationId = useId()
  const validation = !name.trim() ? 'Enter a grant name.' : !funder.trim() ? 'Enter a funder.' : !Number.isFinite(Number(amount)) || Number(amount) <= 0 ? 'Enter an amount greater than zero.' : funded && (!start || !end || start >= end) ? 'Choose a funding end date after the start date.' : ''
  const valid = !validation

  function submit() {
    if (!valid) return
    const id = createGrant({
      name: name.trim(),
      funder: funder.trim(),
      amount: Number(amount),
      stage,
      cover,
      ownerId: me.id,
      periodStart: start,
      periodEnd: end,
      deadlines: deadline ? [{ id: uid('d'), label: 'Application due', date: deadline, kind: 'application' }] : [],
      rules: [],
      categories: [],
      questions: [],
      allowSplit: false,
    })
    notify(funded ? 'Grant created — confirm the award setup next' : 'Prospect added — add application questions next')
    onClose()
    nav(`/grants/${id}?tab=setup`)
  }

  return (
    <Modal open={open} onClose={onClose} label={funded ? "New grant" : "Add a prospect"}>
      {funded ? <div className={clsx('relative h-28 pointer-coarse:h-44', `cover-${cover}`)}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-full bg-surface/80 p-1.5 text-slate hover:bg-surface">
          <X size={16} />
        </button>
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap justify-end gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              aria-label={`Cover ${i + 1}`}
              onClick={() => setCover(i)}
              aria-pressed={cover === i}
              className={clsx('h-7 w-7 rounded-full border-2', `cover-${i}`, cover === i ? 'border-white shadow' : 'border-white/40')}
            />
          ))}
          <button onClick={() => setCover((c) => (c + 1) % 6)} aria-label="Shuffle cover" className="flex h-7 w-7 items-center justify-center rounded-full bg-surface/80 text-slate">
            <Shuffle size={12} />
          </button>
        </div>
      </div> : <div className="flex items-center justify-between border-b border-line-2 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate">Add a prospect</h2>
        <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate-2 hover:bg-canvas"><X size={16} /></button>
      </div>}
      <div className="space-y-4 p-6">
        <input
          aria-label="Grant name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Grant name"
          className="w-full bg-transparent text-2xl font-semibold text-slate placeholder:text-slate-3"
        />
        <div className="space-y-2">
          <Row icon={<Building2 size={16} />} label="Funder">
            <input aria-label="Funder" required className={bare} value={funder} onChange={(e) => setFunder(e.target.value)} placeholder="Foundation, agency, or donor" />
          </Row>
          <Row icon={<CircleDollarSign size={16} />} label={funded ? "Award amount" : "Requested"}>
            <span className="text-sm text-slate-3">$</span>
            <input aria-label="Grant amount" required className={bare} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" />
          </Row>
          {funded && <Row icon={<CalendarRange size={16} />} label="Funding period">
            <div className="grid min-w-0 w-full gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <input aria-label="Funding period start" required type="date" className={bare} value={start} onChange={(e) => setStart(e.target.value)} />
              <span aria-hidden="true" className="hidden text-slate-3 sm:inline">→</span>
              <input aria-label="Funding period end" required type="date" className={bare} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </Row>}
          <Row icon={<CalendarRange size={16} />} label="Application due">
            <input aria-label="Application due date" type="date" className={bare} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Row>
          <Row icon={<Flag size={16} />} label="Stage">
            <select aria-label="Grant stage" className={bare} value={stage} onChange={(e) => setStage(e.target.value as GrantStage)}>
              {STAGES.filter((s) => workspaceOf(s.id) === workspaceOf(defaultStage)).map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </Row>
        </div>
        {funded && <p className="text-xs text-slate-3">The funding period is tracked separately from your organization's fiscal year.</p>}
        {validation && <p id={validationId} className="text-xs text-slate-2">{validation}</p>}
        <Button className="w-full" aria-describedby={validation ? validationId : undefined} onClick={submit} disabled={!valid}>{funded ? 'Create grant' : 'Add prospect'}</Button>
      </div>
    </Modal>
  )
}
