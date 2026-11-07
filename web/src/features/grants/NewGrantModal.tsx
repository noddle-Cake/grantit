import clsx from 'clsx'
import { Building2, CalendarRange, CircleDollarSign, Flag, Shuffle, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { STAGES } from '@/lib/labels'
import { Button, Modal } from '@/components/ui'
import { uid } from '@grantit/shared/format'
import { useStore } from '@/store'
import type { GrantStage } from '@grantit/shared/types'

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-canvas px-3.5 py-2.5">
      <span className="text-slate-3">{icon}</span>
      <span className="w-28 shrink-0 text-[0.8125rem] text-slate-2">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  )
}

const bare = 'w-full min-w-0 bg-transparent text-sm text-slate placeholder:text-slate-3 focus:outline-none'

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

  const valid = name.trim() && funder.trim() && Number(amount) > 0 && start < end

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
    notify('Grant created — add questions and budget next')
    onClose()
    nav(`/grants/${id}?tab=setup`)
  }

  return (
    <Modal open={open} onClose={onClose} label="New grant">
      <div className={clsx('relative h-28', `cover-${cover}`)}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-full bg-surface/80 p-1.5 text-slate hover:bg-surface">
          <X size={16} />
        </button>
        <div className="absolute bottom-3 right-3 flex gap-1.5">
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
      </div>
      <div className="space-y-4 p-6">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Grant name"
          className="w-full bg-transparent text-2xl font-semibold text-slate placeholder:text-slate-3/70 focus:outline-none"
        />
        <div className="space-y-2">
          <Row icon={<Building2 size={16} />} label="Funder">
            <input className={bare} value={funder} onChange={(e) => setFunder(e.target.value)} placeholder="Foundation, agency, or donor" />
          </Row>
          <Row icon={<CircleDollarSign size={16} />} label="Amount">
            <span className="text-sm text-slate-3">$</span>
            <input className={bare} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" />
          </Row>
          <Row icon={<CalendarRange size={16} />} label="Funding period">
            <input type="date" className={bare} value={start} onChange={(e) => setStart(e.target.value)} />
            <span className="text-slate-3">→</span>
            <input type="date" className={bare} value={end} onChange={(e) => setEnd(e.target.value)} />
          </Row>
          <Row icon={<CalendarRange size={16} />} label="Application due">
            <input type="date" className={bare} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Row>
          <Row icon={<Flag size={16} />} label="Stage">
            <select className={bare} value={stage} onChange={(e) => setStage(e.target.value as GrantStage)}>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </Row>
        </div>
        <p className="text-xs text-slate-3">The funding period is tracked separately from your organization's fiscal year.</p>
        <Button className="w-full" onClick={submit} disabled={!valid}>Create grant</Button>
      </div>
    </Modal>
  )
}
