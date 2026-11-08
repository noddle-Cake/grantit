import clsx from 'clsx'
import { ArrowRight, Check, CircleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { factCategoryLabel } from '@/lib/labels'
import { Avatar, Button, Card } from '@/components/ui'
import { daysUntil, fmtDate, relativeDay, todayISO } from '@grantit/shared/format'
import { neededNow, type Need, type NeedRef } from '@grantit/shared/needs'
import { recommendOpportunities } from '@grantit/shared/opportunities'
import { can, canApproveFact } from '@grantit/shared/permissions'
import type { Fact } from '@grantit/shared/types'
import { useStore } from '@/store'

const SHOWN = 5

const names = (refs: NeedRef[]) => refs.map((r) => r.name).join(', ')

function Blocks({ need }: { need: Need }) {
  if (need.kind === 'category') return <>Drafts can’t draw on this category until a fact is approved.</>
  const apps = need.blocks.filter((r) => r.kind === 'application')
  const opps = need.blocks.filter((r) => r.kind === 'opportunity')
  return (
    <>
      {apps.length > 0 && <>Blocks {names(apps)}</>}
      {apps.length > 0 && opps.length > 0 && ' · '}
      {opps.length > 0 && <>Would strengthen {names(opps)}</>}
    </>
  )
}

/**
 * The knowledge base's work queue: what applications in progress and recommended opportunities are waiting
 * on, most urgent first, with the action that clears each item.
 */
export function NeededNow({ onAdd, onOpen }: { onAdd: (hint: string) => void; onOpen: (fact: Fact) => void }) {
  const { state, me, opportunities, dismissedOpportunities, setFactStatus, notify } = useStore()
  const [showAll, setShowAll] = useState(false)
  const needs = useMemo(() => {
    const recs = recommendOpportunities(opportunities, state.facts, state.grants, { today: todayISO(), dismissed: dismissedOpportunities })
    return neededNow(state.grants, state.facts, recs)
  }, [opportunities, state.facts, state.grants, dismissedOpportunities])

  if (!needs.length) return null
  const visible = showAll ? needs : needs.slice(0, SHOWN)
  const canEdit = can(me.role, 'fact:edit')

  function action(need: Need) {
    if (need.kind !== 'approve') {
      const hint = need.kind === 'add' ? need.topic : factCategoryLabel(need.category).toLowerCase()
      return canEdit && <Button size="sm" variant="secondary" onClick={() => onAdd(hint)}>Add fact</Button>
    }
    const { fact } = need
    if (canApproveFact(me.role, fact.category))
      return (
        <Button size="sm" variant="secondary" icon={<Check size={14} />} onClick={() => { setFactStatus(fact.id, 'approved'); notify(`Approved “${fact.title}”`) }}>
          Approve
        </Button>
      )
    if (fact.status === 'draft' && canEdit)
      return <Button size="sm" variant="ghost" onClick={() => { setFactStatus(fact.id, 'pending'); notify('Submitted for approval') }}>Submit for approval</Button>
    const approver = state.users.find((u) => u.id !== me.id && canApproveFact(u.role, fact.category))
    return approver && (
      <span className="flex items-center gap-1.5 text-xs text-slate-2">
        <Avatar initials={approver.initials} size={16} /> Waiting on {approver.name.split(' ')[0]}
      </span>
    )
  }

  return (
    <Card
      className="mb-5"
      padded={false}
      title={<span className="flex items-center gap-2"><CircleAlert size={16} className="text-warn" /> Needed now</span>}
      action={<span className="text-xs text-slate-3">What applications and matches are waiting on, soonest deadline first</span>}
    >
      <ul aria-label="Needed now" className="divide-y divide-line-2">
        {visible.map((need) => {
          const key = need.kind === 'approve' ? need.fact.id : need.kind === 'add' ? need.topic : need.category
          return (
            <li key={`${need.kind}:${key}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate">
                  {need.kind === 'approve' ? (
                    <>
                      Approve{' '}
                      <button type="button" onClick={() => onOpen(state.facts.find((f) => f.id === need.fact.id)!)} className="font-medium text-link hover:underline">
                        {need.fact.title}
                      </button>
                    </>
                  ) : need.kind === 'add' ? (
                    <>Add a fact about <span className="font-medium">{need.topic}</span></>
                  ) : (
                    <>No approved <span className="font-medium">{factCategoryLabel(need.category).toLowerCase()}</span> facts</>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-slate-2">
                  <Blocks need={need} />
                  {need.due && (
                    <span title={fmtDate(need.due)} className={clsx(daysUntil(need.due) <= 14 && 'font-medium text-brand-dark')}>
                      {' · '}Due {relativeDay(need.due)}
                    </span>
                  )}
                </p>
              </div>
              {action(need)}
            </li>
          )
        })}
      </ul>
      {needs.length > SHOWN && (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll((s) => !s)}
          className="flex w-full items-center gap-1 border-t border-line-2 px-5 py-2.5 text-sm font-medium text-link hover:bg-canvas"
        >
          {showAll ? 'Show fewer' : `Show all ${needs.length}`} <ArrowRight size={14} />
        </button>
      )}
    </Card>
  )
}
