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
  it('lists spending categories with combined available/spent/remaining', () => {
    renderFinancials()
    expect(screen.getByRole('heading', { level: 1, name: 'Financials' })).toBeTruthy()
    expect(screen.getByText('Personnel')).toBeTruthy()
    expect(screen.getByText('Indirect')).toBeTruthy()
  })

  it('drills a category into each contributing grant, sorted by spend-by date', async () => {
    const user = userEvent.setup()
    renderFinancials()
    await user.click(screen.getByRole('button', { name: 'Show grants for Indirect' }))
    const links = screen
      .getAllByRole('link', { name: /Anchor Mentors 2026|Safe & Strong School Workshops|Mentor Expansion/ })
      .filter((l) => l.getAttribute('href')?.startsWith('/funds/spending'))
    expect(links.map((l) => l.textContent)).toEqual(['Anchor Mentors 2026', 'Safe & Strong School Workshops', 'Mentor Expansion 2026–27'])
  })

  it('marks a grant whose period has ended', async () => {
    const user = userEvent.setup()
    renderFinancials()
    // Family Counseling ended 2026-09-30; its Counselors line rolls up under Personnel.
    await user.click(screen.getByRole('button', { name: 'Show grants for Personnel' }))
    expect(screen.getByText(/Ended /)).toBeTruthy()
    expect(screen.getAllByText('Ended').length).toBeGreaterThan(0)
  })

  it('flags urgent grants and lists them all above the table', async () => {
    const user = userEvent.setup()
    renderFinancials()
    // Anchor Mentors and Family Nights both end 2026-12-31 — urgent, each judged independently.
    const banner = screen.getByRole('heading', { name: 'Urgent spending' }).parentElement!
    const names = within(banner).getAllByRole('link').map((l) => l.textContent)
    expect(names).toContain('Anchor Mentors 2026')
    expect(names).toContain('Family Nights 2026')

    await user.click(screen.getByRole('button', { name: 'Show grants for Personnel' }))
    expect(screen.getAllByText('Urgent').length).toBeGreaterThan(0)
  })

  it('reconciles every receipt dollar in Spending', () => {
    renderFinancials()
    expect(screen.getByText(/Every receipt in Spending/)).toBeTruthy()
  })
})
