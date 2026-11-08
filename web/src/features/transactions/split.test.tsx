import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FundedGrantsTable } from '@/features/funds/FundedGrantsTable'
import { AppStoreProvider } from '@/store'
import { STORAGE_KEY } from '@/store/migrate'
import type { AppState } from '@grantit/shared/types'
import Transactions from './TransactionsPage'

const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState
const tx = (id: string) => saved().transactions.find((t) => t.id === id)!
const spending = () => render(<MemoryRouter><AppStoreProvider><Transactions /></AppStoreProvider></MemoryRouter>)
const openDrawer = async (user: ReturnType<typeof userEvent.setup>, description: string) => {
  await user.click(screen.getByRole('button', { name: `Review expense: ${description}` }))
  return screen.getByRole('dialog', { name: 'Review expense' })
}
const amounts = (drawer: HTMLElement) => within(drawer).getAllByRole('spinbutton').map((i) => (i as HTMLInputElement).value)
async function setAmount(user: ReturnType<typeof userEvent.setup>, drawer: HTMLElement, i: number, value: string) {
  const input = within(drawer).getAllByRole('spinbutton')[i]
  await user.clear(input)
  await user.type(input, value)
}
const select = (drawer: HTMLElement, name: string) => within(drawer).getByRole('combobox', { name }) as HTMLSelectElement

describe('split receipts', { timeout: 20_000 }, () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  async function startSplit(user: ReturnType<typeof userEvent.setup>) {
    const drawer = await openDrawer(user, 'Printer toner, paper')
    await user.click(within(drawer).getByRole('button', { name: /Add a line/ }))
    await user.click(within(drawer).getByRole('button', { name: /Split across another line/ }))
    await setAmount(user, drawer, 0, '300')
    await setAmount(user, drawer, 1, '110')
    return drawer
  }

  it('keeps an in-progress split when a program is picked in the drawer', async () => {
    const user = userEvent.setup()
    spending()
    const drawer = await startSplit(user)
    await user.selectOptions(select(drawer, 'Program'), 'School workshops')
    expect(amounts(drawer)).toEqual(['300', '110'])
    expect(tx('t-u3').programId).toBe('p-workshops')
  })

  it('saves each line’s amount, category and program, and shows them on reopening', async () => {
    const user = userEvent.setup()
    spending()
    let drawer = await startSplit(user)
    await user.selectOptions(select(drawer, 'Line 1 program'), 'School workshops')
    await user.selectOptions(select(drawer, 'Line 2 category'), 'Contract services')
    await user.selectOptions(select(drawer, 'Line 2 program'), 'Mentoring')
    const chargeTo = within(drawer).getAllByRole('combobox', { name: 'Charge to' }) as HTMLSelectElement[]
    await user.selectOptions(chargeTo[0], 'g-safe|c2')
    await user.selectOptions(chargeTo[1], 'g-anchor|c4')
    await user.click(within(drawer).getByRole('button', { name: 'Confirm' }))

    const saveState = tx('t-u3')
    expect(saveState).toMatchObject({ status: 'done', source: 'manual', categoryId: 'cat-supplies', programId: 'p-workshops' })
    expect(saveState.allocations).toEqual([
      { grantId: 'g-safe', budgetLineId: 'c2', amount: 300, categoryId: 'cat-supplies', programId: 'p-workshops' },
      { grantId: 'g-anchor', budgetLineId: 'c4', amount: 110, categoryId: 'cat-contract', programId: 'p-mentoring' },
    ])

    // Reopen from storage, as after a page reload.
    cleanup()
    spending()
    await user.click(screen.getByRole('button', { name: /^All/ }))
    drawer = await openDrawer(user, 'Printer toner, paper')
    expect(amounts(drawer)).toEqual(['300', '110'])
    expect(select(drawer, 'Line 1 program').selectedOptions[0].text).toBe('School workshops')
    expect(select(drawer, 'Line 2 category').selectedOptions[0].text).toBe('Contract services')
    expect(select(drawer, 'Line 2 program').selectedOptions[0].text).toBe('Mentoring')
    expect(select(drawer, 'Category').disabled).toBe(true)
  })

  it('won’t confirm lines that don’t add up to the receipt', async () => {
    const user = userEvent.setup()
    spending()
    const drawer = await startSplit(user)
    await setAmount(user, drawer, 1, '100')
    expect((within(drawer).getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('table Pick a program and Pick a category save and re-suggest', async () => {
    const user = userEvent.setup()
    spending()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Program for Printer toner, paper' }), 'School workshops')
    expect(tx('t-u3')).toMatchObject({ programId: 'p-workshops', status: 'suggested', allocations: [{ grantId: 'g-safe', budgetLineId: 'c2', amount: 410 }] })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Category for Printer toner, paper' }), 'Travel')
    expect(tx('t-u3')).toMatchObject({ categoryId: 'cat-travel', allocations: [{ grantId: 'g-safe', budgetLineId: 'c3', amount: 410 }] })
  })

  it('shows the same grant total in Funded grants and Spending', () => {
    render(<MemoryRouter><AppStoreProvider><FundedGrantsTable /></AppStoreProvider></MemoryRouter>)
    const row = screen.getByRole('link', { name: 'Anchor Mentors 2026' }).closest('tr')!
    expect(row.textContent).toContain('$79,500')
    cleanup()
    render(<MemoryRouter initialEntries={['/?view=all&grant=g-anchor']}><AppStoreProvider><Transactions /></AppStoreProvider></MemoryRouter>)
    expect(screen.getByText(/On this grant \$79,500\.00/)).toBeTruthy()
  })
})
