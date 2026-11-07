import type { GrantStage } from './types.ts'

/**
 * The app has two workspaces, split by where a grant is in its life:
 * - apply: finding and applying for funding (prospect → drafting → submitted, or declined)
 * - funds: managing money that was awarded (awarded → reporting → closed)
 */
export type Workspace = 'apply' | 'funds'

export const APPLY_STAGES = ['prospect', 'drafting', 'submitted', 'declined'] as const satisfies readonly GrantStage[]
export const FUNDED_STAGES = ['awarded', 'reporting', 'closed'] as const satisfies readonly GrantStage[]

export const WORKSPACE_STAGES: Record<Workspace, readonly GrantStage[]> = { apply: APPLY_STAGES, funds: FUNDED_STAGES }

export const workspaceOf = (stage: GrantStage): Workspace => ((FUNDED_STAGES as readonly GrantStage[]).includes(stage) ? 'funds' : 'apply')
