import { createContext, useContext } from 'react'
import type { Opportunity } from '@grantit/shared/opportunities'
import type { Coding } from '@grantit/shared/auto-assign'
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
  /** Change a row's category, program or service date, and re-suggest for that row only. */
  recodeTransaction: (txId: string, coding: Coding) => void
  /** A person's own allocation: saved as manual and confirmed. */
  assignTransaction: (txId: string, allocations: Allocation[]) => void
  /** Confirm rows that already have allocations. */
  confirmTransactions: (txIds: string[]) => void
  /** Re-run auto-assign over everything unconfirmed, after a grant's terms change. */
  reassignUnconfirmed: () => void
  // chart of accounts
  addOrgCategory: (name: string) => void
  renameOrgCategory: (id: string, name: string) => void
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
