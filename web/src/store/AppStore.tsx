import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { seedState } from '../data/seed'
import { computeFlags } from '../lib/finance'
import { todayISO, uid } from '../lib/format'
import type { Allocation, AppState, Fact, Grant, Question, Transaction, TxFlag, User } from '../types'

const STORAGE_KEY = 'tidepath:v1'

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as AppState
  } catch {
    /* ignore corrupt / unavailable storage */
  }
  return structuredClone(seedState)
}

export interface Toast {
  id: string
  message: string
  tone?: 'success' | 'info' | 'error'
}

interface Store {
  state: AppState
  me: User
  flags: Map<string, TxFlag[]>
  toasts: Toast[]
  notify: (message: string, tone?: Toast['tone']) => void
  setCurrentUser: (id: string) => void
  resetDemo: () => void
  setFiscalYearStart: (month: number) => void
  // facts
  saveFact: (fact: Omit<Fact, 'id' | 'updatedAt' | 'updatedBy'> & { id?: string }) => void
  setFactStatus: (id: string, status: Fact['status']) => void
  deleteFact: (id: string) => void
  // grants
  createGrant: (g: Omit<Grant, 'id'>) => string
  updateGrant: (id: string, patch: Partial<Grant>) => void
  updateQuestion: (grantId: string, qid: string, patch: Partial<Question>) => void
  // transactions
  importTransactions: (txs: Omit<Transaction, 'id'>[]) => void
  setAllocations: (txId: string, allocations: Allocation[]) => void
  markReviewed: (txIds: string[], reviewed?: boolean) => void
}

const Ctx = createContext<Store | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load)
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* storage full or blocked — app still works in memory */
    }
  }, [state])

  const me = state.users.find((u) => u.id === state.currentUserId) ?? state.users[0]
  const flags = useMemo(() => computeFlags(state.grants, state.transactions), [state.grants, state.transactions])

  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = uid('toast')
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const updateGrants = (fn: (g: Grant) => Grant, id: string) =>
    setState((s) => ({ ...s, grants: s.grants.map((g) => (g.id === id ? fn(g) : g)) }))

  const store: Store = {
    state,
    me,
    flags,
    toasts,
    notify,
    setCurrentUser: (id) => setState((s) => ({ ...s, currentUserId: id })),
    resetDemo: () => setState(structuredClone(seedState)),
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
  }

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be used inside AppStoreProvider')
  return s
}
