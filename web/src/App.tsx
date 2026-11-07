import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { EmptyState } from './components/ui'
import Dashboard from './pages/Dashboard'
import GrantRecord from './pages/GrantRecord'
import Grants from './pages/Grants'
import KnowledgeBase from './pages/KnowledgeBase'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Team from './pages/Team'
import Transactions from './pages/Transactions'
import { AppStoreProvider } from './store/AppStore'
import { Compass } from 'lucide-react'

export default function App() {
  return (
    <AppStoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="grants" element={<Grants />} />
            <Route path="grants/:id" element={<GrantRecord />} />
            <Route path="knowledge" element={<KnowledgeBase />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="reports" element={<Reports />} />
            <Route path="team" element={<Team />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<EmptyState icon={<Compass />} title="Page not found" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppStoreProvider>
  )
}
