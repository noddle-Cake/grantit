import { Plus } from 'lucide-react'
import { useState } from 'react'
import { NewGrantModal } from '@/features/grants/NewGrantModal'
import { Button } from '@/components/ui'
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
      {can(me.role, 'grant:configure') && (
        <div className="mb-4 flex justify-end">
          <Button icon={<Plus size={16} />} onClick={() => setNewOpen(true)}>Add awarded grant</Button>
        </div>
      )}
      <ActionCards className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3" />
      <FundedGrantsTable />
      <NewGrantModal open={newOpen} onClose={() => setNewOpen(false)} defaultStage="awarded" />
    </>
  )
}
