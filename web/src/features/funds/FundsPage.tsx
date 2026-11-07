import { AlertTriangle, CircleDollarSign, Plus, Receipt, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GrantList } from '@/features/grants/GrantList'
import { NewGrantModal } from '@/features/grants/NewGrantModal'
import { Button, Card, Meter, PageHeader, Stat, StatusPill } from '@/components/ui'
import { computeFinancials } from '@grantit/shared/finance'
import { money, pct } from '@grantit/shared/format'
import { can } from '@grantit/shared/permissions'
import { useStore } from '@/store'

/** Manage funds: money that was awarded, how it's being spent, and what needs attention. */
export default function Funds() {
  const { state, me, flags } = useStore()
  const [newOpen, setNewOpen] = useState(false)

  const active = useMemo(() => state.grants.filter((g) => g.stage === 'awarded' || g.stage === 'reporting'), [state.grants])
  const fin = useMemo(() => active.map((g) => ({ g, f: computeFinancials(g, state.transactions) })), [active, state.transactions])
  const totalAwarded = active.reduce((s, g) => s + g.amount, 0)
  const totalSpent = fin.reduce((s, x) => s + x.f.spent, 0)
  const flagged = [...flags.values()].filter((f) => f.length).length
  const atRisk = fin.flatMap(({ g, f }) => f.categories.filter((c) => c.status !== 'ok').map((c) => ({ g, c })))

  return (
    <>
      <PageHeader
        eyebrow="Manage funds"
        title="Funded grants"
        subtitle="Awarded money, spending in each funder's own period, and compliance."
        actions={can(me.role, 'grant:configure') && <Button icon={<Plus size={16} />} onClick={() => setNewOpen(true)}>Add awarded grant</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<CircleDollarSign size={15} />} label="Active funding" value={money(totalAwarded)} sub={`${active.length} active grants`} />
        <Stat icon={<Wallet size={15} />} label="Spent to date" value={money(totalSpent)} sub={`${pct(totalAwarded ? totalSpent / totalAwarded : 0)} of active budgets`} />
        <Stat icon={<CircleDollarSign size={15} />} label="Remaining" value={money(totalAwarded - totalSpent)} sub="Within each grant's own period" />
        <Link to="/funds/spending?view=flagged" className="block">
          <Stat icon={<Receipt size={15} />} label="Flagged transactions" value={flagged} sub={flagged ? 'Review in Spending →' : 'Nothing to review'} />
        </Link>
      </div>

      {atRisk.length > 0 && (
        <Card className="mb-6" title="Budget watch" action={<span className="text-xs text-slate-3">Categories ≥ 85% spent</span>} padded={false}>
          <ul className="divide-y divide-line-2">
            {atRisk.map(({ g, c }) => (
              <li key={g.id + c.id} className="flex flex-wrap items-center gap-4 px-5 py-3 sm:flex-nowrap">
                <AlertTriangle size={16} className={c.status === 'over' ? 'text-bad' : 'text-warn'} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate">{c.name}</div>
                  <Link to={`/grants/${g.id}?tab=budget`} className="text-xs text-slate-3 hover:text-link">{g.name}</Link>
                </div>
                <div className="w-40">
                  <Meter value={c.spent} max={c.budget} height={6} />
                  <div className="mt-1 text-right text-xs tabular-nums text-slate-2">{money(c.spent)} / {money(c.budget)}</div>
                </div>
                <StatusPill tone={c.status === 'over' ? 'bad' : 'warn'}>{c.status === 'over' ? 'Over budget' : 'Approaching'}</StatusPill>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <GrantList scope="funds" />

      <NewGrantModal open={newOpen} onClose={() => setNewOpen(false)} defaultStage="awarded" />
    </>
  )
}
