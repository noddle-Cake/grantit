import { Settings2 } from 'lucide-react'
import { Pill } from '@/components/ui'

/** Shown on awarded/reporting grants whose budget and period haven't been confirmed (see shared/setup.ts). */
export function NeedsSetupPill({ className }: { className?: string }) {
  return (
    <Pill tone="warn" className={className}>
      <Settings2 size={11} aria-hidden /> Needs setup
    </Pill>
  )
}
