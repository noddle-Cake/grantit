import { Check, Minus } from 'lucide-react'
import { Avatar, Card, PageHeader, Pill } from '@/components/ui'
import { can, ROLE_LABEL, ROLE_SUMMARY, type Action } from '@/lib/permissions'
import { useStore } from '@/store'
import type { Role } from '@/types'

const ACTIONS: { id: Action; label: string }[] = [
  { id: 'grant:configure', label: 'Configure grants, questions & budgets' },
  { id: 'application:draft', label: 'Draft & edit application answers' },
  { id: 'application:approve', label: 'Approve application answers' },
  { id: 'fact:edit', label: 'Add & edit organizational facts' },
  { id: 'fact:approve', label: 'Approve facts (program staff: program facts only)' },
  { id: 'finance:import', label: 'Import transactions' },
  { id: 'finance:review', label: 'Review & reclassify transactions' },
]
const ROLES: Role[] = ['director', 'finance', 'program']

export default function Team() {
  const { state, me } = useStore()
  return (
    <>
      <PageHeader title="Team & roles" subtitle="Who can do what. Use the account menu (top right) to preview each role." />
      <div className="grid gap-4 md:grid-cols-3">
        {state.users.map((u) => (
          <Card key={u.id}>
            <div className="flex items-center gap-3">
              <Avatar initials={u.initials} size={44} />
              <div>
                <div className="font-semibold text-slate">{u.name}</div>
                <div className="text-sm text-slate-2">{u.title}</div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Pill tone="info">{ROLE_LABEL[u.role]}</Pill>
              {u.id === me.id && <Pill tone="brand">You</Pill>}
            </div>
            <p className="mt-2 text-xs text-slate-3">{ROLE_SUMMARY[u.role]}</p>
          </Card>
        ))}
      </div>
      <Card title="Permissions" className="mt-6" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-canvas text-xs font-semibold uppercase tracking-wide text-slate-2">
              <tr>
                <th className="px-5 py-3 text-left">Capability</th>
                {ROLES.map((r) => <th key={r} className="px-5 py-3 text-center">{ROLE_LABEL[r]}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-2">
              {ACTIONS.map((a) => (
                <tr key={a.id}>
                  <td className="px-5 py-3 text-slate">{a.label}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-5 py-3 text-center">
                      {can(r, a.id) ? <Check size={16} className="inline text-good" aria-label="Allowed" /> : <Minus size={16} className="inline text-line" aria-label="Not allowed" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
