import { createContext, useContext } from 'react'
import type { Opportunity } from '@grantit/shared/opportunities'
import type { Allocation, AppState, Fact, Grant, Question, Transaction, TxFlag, User } from '@grantit/shared/types'

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: string
  message: string
  tone?: 'success' | 'info' | 'error'
  action?: ToastAction
}

export interface Store {
  state: AppState
  me: User
  flags: Map<string, TxFlag[]>
  toasts: Toast[]
  dismissToast: (id: string) => void
  notify: (message: string, tone?: Toast['tone'], action?: ToastAction) => void
  setCurrentUser: (id: string) => void
  resetDemo: () => void
  setFiscalYearStart: (month: number) => void
  // facts
  saveFact: (fact: Omit<Fact, 'id' | 'updatedAt' | 'updatedBy'> & { id?: string }) => void
  setFactStatus: (id: string, status: Fact['status']) => void
  deleteFact: (id: string) => void
  /** Put back a deleted fact exactly as it was (Undo). */
  restoreFact: (fact: Fact) => void
  // grants
  createGrant: (g: Omit<Grant, 'id'>) => string
  updateGrant: (id: string, patch: Partial<Grant>) => void
  /** Save the award's period and budget and record that setup was confirmed today. */
  confirmGrantSetup: (id: string, patch: Partial<Grant>) => void
  updateQuestion: (grantId: string, qid: string, patch: Partial<Question>) => void
  // transactions
  importTransactions: (txs: Omit<Transaction, 'id'>[]) => void
  /** Replace a transaction's allocations. A change resets `reviewed`; any grant clears `notGrantFunded`. */
  setAllocations: (txId: string, allocations: Allocation[]) => void
  /** Mark unassigned transactions as paid from unrestricted funds (or undo). Assigned ones are left alone. */
  setNotGrantFunded: (txIds: string[], value: boolean) => void
  markReviewed: (txIds: string[], reviewed?: boolean) => void
  // funding opportunities (demo listings until a real search exists)
  opportunities: Opportunity[]
  dismissedOpportunities: string[]
  dismissOpportunity: (id: string) => void
  restoreOpportunities: () => void
  /** Creates a prospect grant from the opportunity and returns its id. */
  addOpportunity: (o: Opportunity) => string
}

export const StoreContext = createContext<Store | null>(null)

export function useStore() {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore must be used inside AppStoreProvider')
  return s
}
