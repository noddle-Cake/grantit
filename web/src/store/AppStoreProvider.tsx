import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { grantFromOpportunity } from '@grantit/shared/opportunities'
import { demoOpportunities } from '@grantit/shared/opportunities-demo'
import { seedState } from '@grantit/shared/seed'
import { computeFlags } from '@grantit/shared/finance'
import { todayISO, uid } from '@grantit/shared/format'
import type { AppState, Fact, Grant } from '@grantit/shared/types'
import { StoreContext, type Store, type Toast } from './context'

const STORAGE_KEY = 'grantit:v2' // v2: Tidepath demo data; bumping drops older saved demo state
const DISMISSED_KEY = 'grantit:dismissed-opportunities:v1'

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as AppState
  } catch {
    /* ignore corrupt / unavailable storage */
  }
  return structuredClone(seedState)
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
      // Toasts with an action (Undo) stay long enough to reach.
      setTimeout(() => dismissToast(id), action ? 8000 : 3200)
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
    updateQuestion: (grantId, qid, patch) =>
      updateGrants((g) => ({ ...g, questions: g.questions.map((q) => (q.id === qid ? { ...q, ...patch, updatedAt: todayISO() } : q)) }), grantId),

    importTransactions: (txs) =>
      setState((s) => ({ ...s, transactions: [...txs.map((t) => ({ ...t, id: uid('t') })), ...s.transactions] })),
    setAllocations: (txId, allocations) =>
      setState((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === txId ? { ...t, allocations } : t)) })),
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
