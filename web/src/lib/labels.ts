import type { AnswerStatus, FactCategory, FactStatus, GrantStage, Transaction } from '@grantit/shared/types'
import { workspaceOf, type Workspace } from '@grantit/shared/workspaces'
import type { Tone } from '@/components/ui'

export const STAGES: { id: GrantStage; label: string; tone: Tone }[] = [
  { id: 'prospect', label: 'Prospect', tone: 'neutral' },
  { id: 'drafting', label: 'Drafting', tone: 'brand' },
  { id: 'submitted', label: 'Submitted', tone: 'info' },
  { id: 'awarded', label: 'Active', tone: 'good' },
  { id: 'reporting', label: 'Reporting', tone: 'warn' },
  { id: 'closed', label: 'Closed', tone: 'neutral' },
  { id: 'declined', label: 'Declined', tone: 'bad' },
]
export const stageMeta = (s: GrantStage) => STAGES.find((x) => x.id === s)!

export const FACT_CATEGORIES: { id: FactCategory; label: string }[] = [
  { id: 'mission', label: 'Mission' },
  { id: 'organization', label: 'Organization' },
  { id: 'program', label: 'Programs' },
  { id: 'service', label: 'Services' },
  { id: 'beneficiaries', label: 'Beneficiaries' },
  { id: 'outcome', label: 'Outcomes' },
  { id: 'finance', label: 'Finance' },
]
export const factCategoryLabel = (c: FactCategory) => FACT_CATEGORIES.find((x) => x.id === c)?.label ?? c

export const FACT_STATUS: Record<FactStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending: { label: 'Needs approval', tone: 'warn' },
  approved: { label: 'Approved', tone: 'good' },
}

export const ANSWER_STATUS: Record<AnswerStatus, { label: string; tone: Tone }> = {
  empty: { label: 'Not started', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'brand' },
  approved: { label: 'Approved', tone: 'good' },
}

export const WORKSPACES: Record<Workspace, { label: string; home: string; listLabel: string }> = {
  apply: { label: 'Find & apply', home: '/apply', listLabel: 'Opportunities' },
  funds: { label: 'Manage funds', home: '/funds', listLabel: 'Funded grants' },
}
export const workspaceFor = (stage: GrantStage) => WORKSPACES[workspaceOf(stage)]

export const SOURCE_LABEL: Record<Transaction['source'], string> = {
  csv: 'CSV import',
  'quickbooks-sample': 'QuickBooks sample',
  manual: 'Entered manually',
}
