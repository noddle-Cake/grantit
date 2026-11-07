import { Compass } from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from '@/app/AppShell'
import { EmptyState } from '@/components/ui'
import { AppStoreProvider } from '@/store'

// Each page is its own chunk, so heavy dependencies (charts, CSV parsing) load only where used.
const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'))
const Opportunities = lazy(() => import('@/features/apply/OpportunitiesPage'))
const Applications = lazy(() => import('@/features/apply/ApplicationsPage'))
const Funds = lazy(() => import('@/features/funds/FundsPage'))
const GrantRecord = lazy(() => import('@/features/grants/GrantRecordPage'))
const KnowledgeBase = lazy(() => import('@/features/knowledge/KnowledgeBasePage'))
const Transactions = lazy(() => import('@/features/transactions/TransactionsPage'))
const Reports = lazy(() => import('@/features/reports/ReportsPage'))
const Team = lazy(() => import('@/features/team/TeamPage'))
const Settings = lazy(() => import('@/features/settings/SettingsPage'))

function PageLoading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <div className="shimmer h-8 w-64 rounded" />
      <div className="shimmer h-4 w-96 max-w-full rounded" />
      <div className="shimmer mt-6 h-48 rounded-lg" />
    </div>
  )
}

export default function App() {
  return (
    <AppStoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Page el={<Dashboard />} />} />

            {/* Find & apply */}
            <Route path="apply" element={<Page el={<Opportunities />} />} />
            <Route path="apply/applications" element={<Page el={<Applications />} />} />
            <Route path="apply/knowledge" element={<Page el={<KnowledgeBase />} />} />

            {/* Manage funds */}
            <Route path="funds" element={<Page el={<Funds />} />} />
            <Route path="funds/spending" element={<Page el={<Transactions />} />} />
            <Route path="funds/reports" element={<Page el={<Reports />} />} />

            {/* A grant's record page serves both workspaces */}
            <Route path="grants/:id" element={<Page el={<GrantRecord />} />} />

            {/* Old addresses, kept working for bookmarks */}
            <Route path="grants" element={<Moved to="/apply" />} />
            <Route path="knowledge" element={<Moved to="/apply/knowledge" />} />
            <Route path="transactions" element={<Moved to="/funds/spending" />} />
            <Route path="reports" element={<Moved to="/funds/reports" />} />

            <Route path="team" element={<Page el={<Team />} />} />
            <Route path="settings" element={<Page el={<Settings />} />} />
            <Route path="*" element={<EmptyState icon={<Compass />} title="Page not found" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppStoreProvider>
  )
}

/** Redirect an old path to its new one, keeping the query string (e.g. ?fact=… or ?view=flagged). */
function Moved({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate replace to={to + search} />
}

function Page({ el }: { el: ReactNode }) {
  return <Suspense fallback={<PageLoading />}>{el}</Suspense>
}
