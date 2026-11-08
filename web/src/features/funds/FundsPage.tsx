import { Plus } from 'lucide-react'
import { useState } from 'react'
import { NewGrantModal } from '@/features/grants/NewGrantModal'
import { Button, PageHeader } from '@/components/ui'
import { can } from '@grantit/shared/permissions'
import { useStore } from '@/store'
import { ActionCards } from './ActionCards'
import { FundedGrantsTable } from './FundedGrantsTable'

/** Manage funds: what to review, which grants are off pace in their own period, and which reports are due. */
export default function Funds() {
  const { me } = useStore()
  const [newOpen, setNewOpen] = useState(false)
  return (
    <>
      <PageHeader
        eyebrow="Manage funds"
        title="Funded grants"
        subtitle="Each grant's spending against its own period, and what needs doing."
        actions={can(me.role, 'grant:configure') && <Button icon={<Plus size={16} />} onClick={() => setNewOpen(true)}>Add awarded grant</Button>}
      />
      <ActionCards className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3" />
      <FundedGrantsTable />
      <NewGrantModal open={newOpen} onClose={() => setNewOpen(false)} defaultStage="awarded" />
    </>
  )
}
