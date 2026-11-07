import { describe, expect, it } from 'vitest'
import { GRANT_STAGES } from './types.ts'
import { APPLY_STAGES, FUNDED_STAGES, workspaceOf } from './workspaces.ts'

describe('workspaces', () => {
  it('puts every grant stage in exactly one workspace', () => {
    const all = [...APPLY_STAGES, ...FUNDED_STAGES]
    expect([...all].sort()).toEqual([...GRANT_STAGES].sort())
    expect(new Set(all).size).toBe(all.length)
  })

  it('sends awarded money to funds and everything before award to apply', () => {
    expect(workspaceOf('prospect')).toBe('apply')
    expect(workspaceOf('submitted')).toBe('apply')
    expect(workspaceOf('declined')).toBe('apply')
    expect(workspaceOf('awarded')).toBe('funds')
    expect(workspaceOf('reporting')).toBe('funds')
    expect(workspaceOf('closed')).toBe('funds')
  })
})
