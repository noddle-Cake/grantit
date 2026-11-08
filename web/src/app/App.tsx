import { Compass } from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from '@/app/AppShell'
import { EmptyState } from '@/components/ui'
import { AuthProvider, useAuth } from '@/lib/auth'
import { AppStoreProvider } from '@/store'

// Public marketing pages.
const Landing = lazy(() => import('@/features/marketing/LandingPage'))
const Login = lazy(() => import('@/features/marketing/LoginPage'))

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
 * Gate the workspace behind sign-in. Signed-out visitors land on the marketing page from the root
 * address and on the sign-in page from any deeper link they tried to reach. This is a product gate,
 * not a security boundary: the app runs entirely in the browser on demo data.
 */
function RequireAuth() {
  const { signedIn } = useAuth()
  const location = useLocation()
  if (!signedIn) {
    return <Navigate replace to={location.pathname === '/' ? '/welcome' : '/login'} state={{ from: location }} />
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppStoreProvider>
        <BrowserRouter>
          <Suspense fallback={<FullPageLoading />}>
            <Routes>
              {/* Public */}
              <Route path="/welcome" element={<Landing />} />
              <Route path="/login" element={<Login />} />

              {/* The workspace. Requires sign-in; renders inside the app shell. */}
              <Route element={<RequireAuth />}>
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
          </Suspense>
        </BrowserRouter>
      </AppStoreProvider>
    </AuthProvider>
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
