import { Compass } from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppShell from '@/app/AppShell'
import { EmptyState } from '@/components/ui'
import { AppStoreProvider } from '@/store'

// Each page is its own chunk, so heavy dependencies (charts, CSV parsing) load only where used.
const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'))
const Grants = lazy(() => import('@/features/grants/GrantsPage'))
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
            <Route path="grants" element={<Page el={<Grants />} />} />
            <Route path="grants/:id" element={<Page el={<GrantRecord />} />} />
            <Route path="knowledge" element={<Page el={<KnowledgeBase />} />} />
            <Route path="transactions" element={<Page el={<Transactions />} />} />
            <Route path="reports" element={<Page el={<Reports />} />} />
            <Route path="team" element={<Page el={<Team />} />} />
            <Route path="settings" element={<Page el={<Settings />} />} />
            <Route path="*" element={<EmptyState icon={<Compass />} title="Page not found" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppStoreProvider>
  )
}

function Page({ el }: { el: ReactNode }) {
  return <Suspense fallback={<PageLoading />}>{el}</Suspense>
}
