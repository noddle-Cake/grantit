import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { assignManually, autoAssign, canConfirm, codeTransaction, recode } from '@grantit/shared/auto-assign'
import { grantFromOpportunity } from '@grantit/shared/opportunities'
import { demoOpportunities } from '@grantit/shared/opportunities-demo'
import { seedState } from '@grantit/shared/seed'
import { computeFlags } from '@grantit/shared/finance'
import { todayISO, uid } from '@grantit/shared/format'
import type { AppState, Fact, Grant } from '@grantit/shared/types'
import { pruneDocs } from '@/lib/doc-store'
import { StoreContext, type Store, type Toast } from './context'
import { loadState, STORAGE_KEY } from './migrate'

const DISMISSED_KEY = 'grantit:dismissed-opportunities:v1'

/** Saved state (v4, or an older version upgraded), falling back to the seed if storage is unavailable or unreadable. */
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

  // Stored PDFs of documents deleted in an earlier visit (Undo toasts don't outlive a reload) or dropped by a reset.
  useEffect(() => {
    void pruneDocs(state.sourceDocs.map((d) => d.id))
    // once per page load, with the state as loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

    addSourceDoc: (doc) =>
      setState((s) => ({
        ...s,
        sourceDocs: [
          { ...doc, uploadedAt: todayISO(), uploadedBy: s.currentUserId, ...(doc.status === 'approved' ? { approvedBy: s.currentUserId, approvedAt: todayISO() } : {}) },
          ...s.sourceDocs,
        ],
      })),
    setSourceDocStatus: (id, status) =>
      setState((s) => ({
        ...s,
        sourceDocs: s.sourceDocs.map((d) => {
          if (d.id !== id) return d
          const { approvedBy: _b, approvedAt: _a, ...rest } = d
          return status === 'approved' ? { ...rest, status, approvedBy: s.currentUserId, approvedAt: todayISO() } : { ...rest, status }
        }),
      })),
    deleteSourceDoc: (id) => setState((s) => ({ ...s, sourceDocs: s.sourceDocs.filter((d) => d.id !== id) })),
    restoreSourceDoc: (doc) => setState((s) => (s.sourceDocs.some((d) => d.id === doc.id) ? s : { ...s, sourceDocs: [doc, ...s.sourceDocs] })),
    checkCitation: (grantId, qid, citationId, ok) =>
      updateGrants(
        (g) => ({
          ...g,
          questions: g.questions.map((q) =>
            q.id !== qid
              ? q
              : {
                  ...q,
                  docCitations: q.docCitations?.map((c) => {
                    if (c.id !== citationId) return c
                    const { check: _c, ...rest } = c
                    return ok === null ? rest : { ...rest, check: { ok, by: state.currentUserId, at: todayISO() } }
                  }),
                },
          ),
        }),
        grantId,
      ),

    createGrant: (g) => {
      const id = uid('g')
      setState((s) => ({ ...s, grants: [{ ...g, id }, ...s.grants] }))
      return id
    },
    updateGrant: (id, patch) => updateGrants((g) => ({ ...g, ...patch }), id),
    confirmGrantSetup: (id, patch) =>
      setState((s) => {
        const grants = s.grants.map((g) => (g.id === id ? { ...g, ...patch, setupConfirmedAt: todayISO() } : g))
        return { ...s, grants, transactions: autoAssign({ ...s, grants }) }
      }),
    updateQuestion: (grantId, qid, patch) =>
      updateGrants((g) => ({ ...g, questions: g.questions.map((q) => (q.id === qid ? { ...q, ...patch, updatedAt: todayISO() } : q)) }), grantId),

    importTransactions: (txs) =>
      setState((s) => {
        const incoming = txs.map((t) => codeTransaction({ ...t, id: uid('t') }, s))
        return { ...s, transactions: autoAssign({ ...s, transactions: [...incoming, ...s.transactions] }) }
      }),
    recodeTransaction: (txId, coding) =>
      setState((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === txId ? recode(t, coding, s) : t)) })),
    assignTransaction: (txId, allocations) =>
      setState((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === txId ? assignManually(t, allocations) : t)) })),
    confirmTransactions: (ids) =>
      setState((s) => ({ ...s, transactions: s.transactions.map((t) => (ids.includes(t.id) && canConfirm(t) ? { ...t, status: 'done' as const } : t)) })),
    reassignUnconfirmed: () => setState((s) => ({ ...s, transactions: autoAssign(s) })),

    addOrgCategory: (name) => setState((s) => ({ ...s, orgCategories: [...s.orgCategories, { id: uid('cat'), name, glAccounts: [] }] })),
    renameOrgCategory: (id, name) => setState((s) => ({ ...s, orgCategories: s.orgCategories.map((c) => (c.id === id ? { ...c, name } : c)) })),

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
