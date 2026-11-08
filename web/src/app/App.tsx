import { Compass } from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from '@/app/AppShell'
import { EmptyState } from '@/components/ui'
import { AppStoreProvider } from '@/store'

// Public marketing pages.
const Landing = lazy(() => import('@/features/marketing/LandingPage'))

// Each page is its own chunk, so heavy dependencies (charts, CSV parsing) load only where used.
const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'))
const Calendar = lazy(() => import('@/features/calendar/CalendarPage'))
const Opportunities = lazy(() => import('@/features/apply/OpportunitiesPage'))
const Applications = lazy(() => import('@/features/apply/ApplicationsPage'))
const Funds = lazy(() => import('@/features/funds/FundsPage'))
const Financials = lazy(() => import('@/features/financials/FinancialsPage'))
const GrantRecord = lazy(() => import('@/features/grants/GrantRecordPage'))
const KnowledgeBase = lazy(() => import('@/features/knowledge/KnowledgeBasePage'))
const Transactions = lazy(() => import('@/features/transactions/TransactionsPage'))
const Reports = lazy(() => import('@/features/reports/ReportsPage'))
const Team = lazy(() => import('@/features/team/TeamPage'))
const Settings = lazy(() => import('@/features/settings/SettingsPage'))
const Connectors = lazy(() => import('@/features/connectors/ConnectorsPage'))

function PageLoading() {
  return (
    <div role="status" className="space-y-3" aria-label="Loading page">
      <span className="sr-only">Loading page…</span>
      <div className="shimmer h-8 w-64 rounded" />
      <div className="shimmer h-4 w-96 max-w-full rounded" />
      <div className="shimmer mt-6 h-48 rounded-lg" />
    </div>
  )
}

function FullPageLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex min-h-dvh items-center justify-center bg-canvas">
      <div className="shimmer h-10 w-48 rounded-lg" />
    </div>
  )
}

/**
 * The workspace layout. There is no in-app sign-in: access is controlled by basic auth in front of the whole
 * site (deploy/nginx.conf), so anyone who reaches the app goes straight to it.
 */
function Workspace() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

export default function App() {
  return (
    <AppStoreProvider>
      <BrowserRouter>
        <Suspense fallback={<FullPageLoading />}>
          <Routes>
            {/* Public */}
            <Route path="/welcome" element={<Landing />} />
            {/* The sign-in page is gone; old links land on the workspace. */}
            <Route path="/login" element={<Navigate replace to="/" />} />

            {/* The workspace, inside the app shell. */}
            <Route element={<Workspace />}>
              <Route index element={<Page el={<Dashboard />} />} />
              <Route path="calendar" element={<Page el={<Calendar />} />} />

              {/* Find & apply */}
              <Route path="apply" element={<Page el={<Opportunities />} />} />
              <Route path="apply/applications" element={<Page el={<Applications />} />} />
              <Route path="apply/knowledge" element={<Page el={<KnowledgeBase />} />} />

              {/* Manage funds */}
              <Route path="funds" element={<Page el={<Funds />} />} />
              <Route path="funds/financials" element={<Page el={<Financials />} />} />
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
              <Route path="connectors" element={<Page el={<Connectors />} />} />
              <Route path="settings" element={<Page el={<Settings />} />} />
              <Route path="*" element={<EmptyState icon={<Compass />} title="Page not found" />} />
            </Route>
          </Routes>
        </Suspense>
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
