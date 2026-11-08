import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import AppShell from '@/app/AppShell'
import Transactions from '@/features/transactions/TransactionsPage'
import { AppStoreProvider } from '@/store'

function renderSpending() {
  return render(
    <AppStoreProvider>
      <MemoryRouter initialEntries={['/funds/spending?view=all']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="funds/spending" element={<Transactions />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppStoreProvider>,
  )
}

const openTx = async (user: ReturnType<typeof userEvent.setup>, description: string) => {
  await user.click(screen.getByRole('button', { name: `Review expense: ${description}` }))
  return screen.getByRole('dialog', { name: 'Review expense' })
}

// Save a split expense, reopen it, and check each line keeps its target and amount. The receipt total must equal
// the sum of its lines, and reporting counts each allocation once.
describe('split expenses', () => {
  it('splits an expense across two grants and reopens it intact', async () => {
    const user = userEvent.setup()
    renderSpending()
    // t-u4: Coastal Youth Training Institute, $1,500. Auto-assign already split it: Anchor's Mentor Training
    // line (ending soonest) only had $1,200 left, so $300 spilled to Mentor Expansion's Training line.
    const drawer = await openTx(user, 'Winter mentor training deposit')
    const targets = within(drawer).getAllByRole('combobox', { name: 'Charge to' }) as HTMLSelectElement[]
    expect(targets.map((s) => s.value)).toEqual(['g-anchor|c2', 'g-mentor-expansion|c2'])

    const amounts = within(drawer).getAllByRole('spinbutton', { name: 'Amount' })
    await user.clear(amounts[0])
    await user.type(amounts[0], '900')
    await user.clear(amounts[1])
    await user.type(amounts[1], '600')
    expect(within(drawer).getByText('Balanced')).toBeTruthy()
    await user.click(within(drawer).getByRole('button', { name: 'Confirm' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    // The ledger keeps both lines, summing to the receipt total.
    const row = screen.getByRole('button', { name: 'Review expense: Winter mentor training deposit' }).closest('tr')!
    expect(within(row).getByText('$1,500.00')).toBeTruthy()
    expect(row.textContent).toContain('Anchor Mentors 2026')
    expect(row.textContent).toContain('Mentor Expansion')

    // Reopen: both lines kept their grant line and amount.
    const reopened = await openTx(user, 'Winter mentor training deposit')
    const targets2 = within(reopened).getAllByRole('combobox', { name: 'Charge to' }) as HTMLSelectElement[]
    const amounts2 = within(reopened).getAllByRole('spinbutton', { name: 'Amount' }) as HTMLInputElement[]
    expect(targets2.map((s) => s.value)).toEqual(['g-anchor|c2', 'g-mentor-expansion|c2'])
    expect(amounts2.map((s) => s.value)).toEqual(['900', '600'])
    expect(within(reopened).getByText('Balanced')).toBeTruthy()
  })

  it('re-suggests when a person picks the program', async () => {
    const user = userEvent.setup()
    renderSpending()
    // t-u1: FPL electricity, $820 — no QuickBooks class, so the program pick is up to a person.
    const drawer = await openTx(user, 'Electricity – North family center')
    await user.selectOptions(within(drawer).getByRole('combobox', { name: 'Program' }), 'p-admin')
    // Admin costs are never grant-funded: auto-assign puts the whole amount on General funds.
    const target = within(drawer).getByRole('combobox', { name: 'Charge to' }) as HTMLSelectElement
    expect(target.value).toBe('general')
    expect(within(drawer).getByText('Balanced')).toBeTruthy()
    await user.click(within(drawer).getByRole('button', { name: 'Confirm' }))
    const reopened = await openTx(user, 'Electricity – North family center')
    expect((within(reopened).getByRole('combobox', { name: 'Charge to' }) as HTMLSelectElement).value).toBe('general')
  })
})
