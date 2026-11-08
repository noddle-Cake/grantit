import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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

const grantsTable = (name: string) => screen.getByRole('table', { name: `Grants contributing to ${name}` })

describe('Financials', () => {
  // Deadlines and urgency depend on the date, so the demo's "today" is fixed.
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-08T12:00:00') }) })
  afterAll(() => { vi.useRealTimers() })
  beforeEach(() => localStorage.clear())

  it('lists org categories with what is available, spent and remaining', () => {
    renderFinancials()
    expect(screen.getByRole('heading', { level: 1, name: 'Financials' })).toBeTruthy()
    expect(screen.getByText('$312,800 available across grants')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show grants for Program activities' })).toBeTruthy()
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Financials' })).toBeTruthy()
  })

  it('drills a category into each contributing grant, soonest deadline first', async () => {
    const user = userEvent.setup()
    renderFinancials()
    await user.click(screen.getByRole('button', { name: 'Show grants for Training' }))
    expect(within(grantsTable('Training')).getAllByRole('link').map((l) => l.textContent)).toEqual(['Anchor Mentors 2026', 'Mentor Expansion 2026–27'])
    expect(grantsTable('Training').textContent).toContain('Ends Dec 31, 2026')
  })

  it('separates money left after a deadline passed', async () => {
    const user = userEvent.setup()
    renderFinancials()
    expect(screen.getByText('Past spending deadline').closest('div')!.parentElement!.textContent).toContain('$17,200')
    await user.click(screen.getByRole('button', { name: 'Show grants for Program activities' }))
    expect(grantsTable('Program activities').textContent).toContain('+$4,800 past deadline')
  })

  it('marks both grants with close deadlines urgent, in the same drill-down', async () => {
    const user = userEvent.setup()
    renderFinancials()
    await user.click(screen.getByRole('button', { name: 'Show grants for Program activities' }))
    const urgent = within(grantsTable('Program activities')).getAllByText('Urgent').map((el) => el.closest('tr')!.textContent)
    expect(urgent).toEqual([expect.stringContaining('Anchor Mentors 2026'), expect.stringContaining('Family Nights 2026')])
    expect(within(screen.getByRole('region', { name: 'Urgent spending' })).getAllByRole('link').map((l) => l.textContent)).toEqual(['Anchor Mentors 2026', 'Family Nights 2026'])
  })
})
