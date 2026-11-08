import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { grantFromOpportunity } from '@grantit/shared/opportunities'
import { demoOpportunities } from '@grantit/shared/opportunities-demo'
import { seedState } from '@grantit/shared/seed'
import { computeFlags } from '@grantit/shared/finance'
import { todayISO, uid } from '@grantit/shared/format'
import type { AppState, Fact, Grant } from '@grantit/shared/types'
import { StoreContext, type Store, type Toast } from './context'
import { loadState, STORAGE_KEY } from './migrate'

const DISMISSED_KEY = 'grantit:dismissed-opportunities:v1'

/** Saved state (v3, or v2 upgraded), falling back to the seed if storage is unavailable or unreadable. */
function load(): AppState {
  const read = (key: string) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }
  return loadState(read, seedState, todayISO()).state
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dismissedOpportunities, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[]
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissedOpportunities))
    } catch {
      /* per-browser convenience only */
    }
  }, [dismissedOpportunities])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* storage full or blocked — app still works in memory */
    }
  }, [state])

  const me = state.users.find((u) => u.id === state.currentUserId) ?? state.users[0]
  const flags = useMemo(() => computeFlags(state.grants, state.transactions), [state.grants, state.transactions])

  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const notify = useCallback(
    (message: string, tone: Toast['tone'] = 'success', action?: Toast['action']) => {
      const id = uid('toast')
      setToasts((t) => [...t, { id, message, tone, action }])
      // Undo stays available until explicitly used or dismissed.
      if (!action) setTimeout(() => dismissToast(id), 3200)
    },
    [dismissToast],
  )

  const updateGrants = (fn: (g: Grant) => Grant, id: string) =>
    setState((s) => ({ ...s, grants: s.grants.map((g) => (g.id === id ? fn(g) : g)) }))

  const store: Store = {
    state,
    me,
    flags,
    toasts,
    notify,
    dismissToast,
    setCurrentUser: (id) => setState((s) => ({ ...s, currentUserId: id })),
    resetDemo: () => {
      setState(structuredClone(seedState))
      setDismissed([])
    },
    setFiscalYearStart: (m) => setState((s) => ({ ...s, org: { ...s.org, fiscalYearStartMonth: m } })),

    saveFact: (input) =>
      setState((s) => {
        const approval =
          input.status === 'approved'
            ? { approvedBy: s.currentUserId, approvedAt: todayISO() }
            : { approvedBy: undefined, approvedAt: undefined }
        const base = { ...input, ...approval, updatedAt: todayISO(), updatedBy: s.currentUserId }
        if (input.id && s.facts.some((f) => f.id === input.id))
          return { ...s, facts: s.facts.map((f) => (f.id === input.id ? { ...f, ...base, id: f.id } : f)) }
        return { ...s, facts: [{ ...base, id: uid('f') } as Fact, ...s.facts] }
      }),
    setFactStatus: (id, status) =>
      setState((s) => ({
        ...s,
        facts: s.facts.map((f) =>
          f.id === id
            ? { ...f, status, ...(status === 'approved' ? { approvedBy: s.currentUserId, approvedAt: todayISO() } : { approvedBy: undefined, approvedAt: undefined }) }
            : f,
        ),
      })),
    deleteFact: (id) => setState((s) => ({ ...s, facts: s.facts.filter((f) => f.id !== id) })),
    restoreFact: (fact) => setState((s) => (s.facts.some((f) => f.id === fact.id) ? s : { ...s, facts: [fact, ...s.facts] })),

    createGrant: (g) => {
      const id = uid('g')
      setState((s) => ({ ...s, grants: [{ ...g, id }, ...s.grants] }))
      return id
    },
    updateGrant: (id, patch) => updateGrants((g) => ({ ...g, ...patch }), id),
    confirmGrantSetup: (id, patch) => updateGrants((g) => ({ ...g, ...patch, setupConfirmedAt: todayISO() }), id),
    updateQuestion: (grantId, qid, patch) =>
      updateGrants((g) => ({ ...g, questions: g.questions.map((q) => (q.id === qid ? { ...q, ...patch, updatedAt: todayISO() } : q)) }), grantId),

    importTransactions: (txs) =>
      setState((s) => ({ ...s, transactions: [...txs.map((t) => ({ ...t, id: uid('t') })), ...s.transactions] })),
    // Changing a classification means it needs review again; assigning a grant clears "not grant-funded".
    setAllocations: (txId, allocations) =>
      setState((s) => ({
        ...s,
        transactions: s.transactions.map((t) => {
          if (t.id !== txId || JSON.stringify(t.allocations) === JSON.stringify(allocations)) return t
          const { notGrantFunded: _n, ...rest } = t
          return { ...(allocations.length ? rest : t), allocations, reviewed: false }
        }),
      })),
    setNotGrantFunded: (ids, value) =>
      setState((s) => ({
        ...s,
        transactions: s.transactions.map((t) => {
          if (!ids.includes(t.id) || (value && t.allocations.length)) return t
          const { notGrantFunded: _n, ...rest } = t
          return value ? { ...rest, notGrantFunded: true } : rest
        }),
      })),
    markReviewed: (ids, reviewed = true) =>
      setState((s) => ({ ...s, transactions: s.transactions.map((t) => (ids.includes(t.id) ? { ...t, reviewed } : t)) })),

    opportunities: demoOpportunities,
    dismissedOpportunities,
    dismissOpportunity: (id) => setDismissed((d) => (d.includes(id) ? d : [...d, id])),
    restoreOpportunities: () => setDismissed([]),
    addOpportunity: (o) => {
      const id = uid('g')
      const grant = grantFromOpportunity(o, state.currentUserId, Math.floor(Math.random() * 6))
      setState((s) => ({ ...s, grants: [{ ...grant, id }, ...s.grants] }))
      return id
    },
  }

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}
