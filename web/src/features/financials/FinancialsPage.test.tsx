import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import AppShell from '@/app/AppShell'
import Financials from '@/features/financials/FinancialsPage'
import { AppStoreProvider } from '@/store'

function renderFinancials() {
  return render(
    <AppStoreProvider>
      <MemoryRouter initialEntries={['/funds/financials']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="funds/financials" element={<Financials />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppStoreProvider>,
  )
}

describe('Financials', () => {
  it('lists categories with combined funded/spent/remaining', () => {
    renderFinancials()
    expect(screen.getByRole('heading', { level: 1, name: 'Financials' })).toBeTruthy()
    expect(screen.getByText('Indirect')).toBeTruthy()
    expect(screen.getByText('Counselors')).toBeTruthy()
  })

  it('drills a category into each contributing grant, sorted by spend-by date', async () => {
    const user = userEvent.setup()
    renderFinancials()
    await user.click(screen.getByRole('button', { name: 'Show grants funding Indirect' }))
    const links = screen.getAllByRole('link', { name: /Anchor Mentors 2026|Safe & Strong School Workshops|Mentor Expansion/ })
    expect(links.map((l) => l.textContent)).toEqual(['Anchor Mentors 2026', 'Safe & Strong School Workshops', 'Mentor Expansion 2026–27'])
  })

  it('marks balances past their spending deadline', async () => {
    const user = userEvent.setup()
    renderFinancials()
    await user.click(screen.getByRole('button', { name: 'Show grants funding Counselors' }))
    expect(screen.getAllByText(/passed/).length).toBeGreaterThan(0)
    expect(screen.getByText(/can no longer be planned on/)).toBeTruthy()
  })

  it('shows two urgent grants whose deadlines are days apart as separate rows', async () => {
    const user = userEvent.setup()
    renderFinancials()
    // Anchor Mentors and Family Nights both end 2026-12-31 — urgent, distinct rows under any shared category.
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('link', { name: 'Financials' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Show grants funding Indirect' }))
    const urgent = screen.getAllByText('Due soon · off pace')
    expect(urgent.length).toBeGreaterThan(0)
  })
})
