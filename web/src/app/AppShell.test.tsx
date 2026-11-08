import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AppShell from './AppShell'
import GrantRecord from '@/features/grants/GrantRecordPage'
import KnowledgeBase from '@/features/knowledge/KnowledgeBasePage'
import Settings from '@/features/settings/SettingsPage'
import Transactions from '@/features/transactions/TransactionsPage'
import { AppStoreProvider } from '@/store'
import { seedState } from '@grantit/shared/seed'

function renderApp(path = '/') {
  return render(<AppStoreProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<AppShell />}>
      <Route index element={<h1>Home</h1>} />
      <Route path="grants/:id" element={<GrantRecord />} />
      <Route path="apply/knowledge" element={<KnowledgeBase />} />
      <Route path="funds/spending" element={<Transactions />} />
      <Route path="settings" element={<Settings />} />
    </Route>
  </Routes></MemoryRouter></AppStoreProvider>)
}

describe('app keyboard access', () => {
  it('opens a search result with arrow keys and Enter', async () => {
    const user = userEvent.setup()
    renderApp()
    const search = screen.getByRole('combobox', { name: 'Search grants, funders, and facts' })
    const grant = seedState.grants[0]
    await user.type(search, grant.name)
    expect(search.getAttribute('aria-expanded')).toBe('true')
    await user.keyboard('{ArrowDown}')
    expect(document.getElementById(search.getAttribute('aria-activedescendant')!)?.textContent).toContain(grant.name)
    expect(document.activeElement).toBe(search)
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { level: 1, name: grant.name })).toBeTruthy()
    expect(search.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(document.querySelector('main'))
  })

  it('dismisses search with Escape and provides a no-results message', async () => {
    const user = userEvent.setup()
    renderApp()
    const search = screen.getByRole('combobox')
    await user.type(search, 'mentors')
    await user.keyboard('{ArrowDown}{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(search)
    await user.clear(search)
    await user.type(search, 'no-such-grant-xyz')
    expect(screen.getByText('No results. Try another grant, funder, or fact.')).toBeTruthy()
  })

  it('allows clicking search results while keeping the input focus until selection', async () => {
    const user = userEvent.setup()
    renderApp()
    const grant = seedState.grants[0]
    await user.type(screen.getByRole('combobox'), grant.name)
    await user.click(screen.getAllByRole('option')[0])
    expect(screen.getByRole('heading', { level: 1, name: grant.name })).toBeTruthy()
  })

  it('closes the user disclosure with Escape and restores its trigger', async () => {
    const user = userEvent.setup()
    renderApp()
    const trigger = screen.getByRole('button', { name: /Switch user, current user/ })
    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await user.tab()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Switch user (demo)' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes mobile navigation after following Settings', async () => {
    const user = userEvent.setup()
    renderApp()
    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    await user.click(trigger)
    const navigation = screen.getByRole('dialog', { name: 'Navigation' })
    expect(within(navigation).getByRole('button', { name: 'Close navigation' })).toBeTruthy()
    await user.click(within(navigation).getByRole('link', { name: 'Settings' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
  })

  it('opens a transaction for review using the keyboard', async () => {
    const user = userEvent.setup()
    renderApp('/funds/spending')
    const review = screen.getAllByRole('button', { name: /^Review transaction:/ })[0]
    review.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: 'Review transaction' })).toBeTruthy()
  })

  it('falls back to a valid tab for an unknown tab parameter', () => {
    const grant = seedState.grants[0]
    renderApp(`/grants/${grant.id}?tab=invalid`)
    const tab = screen.getByRole('tab', { selected: true })
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(tab.id)
    for (const control of screen.getAllByRole('tab')) {
      expect(document.getElementById(control.getAttribute('aria-controls')!)).not.toBeNull()
    }
  })

  it('requires a separate confirmation before resetting browser data', async () => {
    const user = userEvent.setup()
    renderApp('/settings')
    const fiscalYear = screen.getByRole('combobox', { name: 'Fiscal year starts' })
    await user.selectOptions(fiscalYear, '7')
    const reset = screen.getByRole('button', { name: 'Reset demo data' })
    await user.click(reset)
    const confirmation = screen.getByRole('dialog', { name: 'Reset demo data' })
    expect(document.activeElement).toBe(within(confirmation).getByRole('button', { name: 'Cancel' }))
    await user.click(within(confirmation).getByRole('button', { name: 'Cancel' }))
    expect((fiscalYear as HTMLSelectElement).value).toBe('7')
    await user.click(reset)
    await user.click(within(screen.getByRole('dialog', { name: 'Reset demo data' })).getByRole('button', { name: 'Reset demo data' }))
    expect((fiscalYear as HTMLSelectElement).value).toBe(String(seedState.org.fiscalYearStartMonth))
  })

  it('keeps Undo available beyond the old timeout and restores the deleted fact', async () => {
    const user = userEvent.setup()
    renderApp('/apply/knowledge')
    await user.click(screen.getByRole('button', { name: /^Mission statement/ }))
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.queryByRole('button', { name: /^Mission statement/ })).toBeNull()
    act(() => vi.advanceTimersByTime(60_000))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: /^Mission statement/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })
})
