import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { seedState } from '@grantit/shared/seed'
import { AppStoreProvider } from '@/store'
import { STORAGE_KEY } from '@/store/migrate'
import GrantRecord from '@/features/grants/GrantRecordPage'
import KnowledgeBase from '@/features/knowledge/KnowledgeBasePage'
import Opportunities from './OpportunitiesPage'
import Applications from './ApplicationsPage'

function renderPage(path: string) {
  return render(<AppStoreProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/apply" element={<Opportunities />} />
    <Route path="/apply/applications" element={<Applications />} />
    <Route path="/apply/knowledge" element={<KnowledgeBase />} />
    <Route path="/grants/:id" element={<GrantRecord />} />
  </Routes></MemoryRouter></AppStoreProvider>)
}

const drafting = seedState.grants.find((g) => g.stage === 'drafting')!
const submitted = seedState.grants.find((g) => g.stage === 'submitted')!
const declined = seedState.grants.find((g) => g.stage === 'declined')!
const awarded = seedState.grants.find((g) => g.stage === 'awarded')!

describe('Find & apply workflow', () => {
  it('keeps discovery focused and preserves match evidence, dismissal, and adding a match', async () => {
    const user = userEvent.setup()
    renderPage('/apply')
    expect(screen.queryByText('Pipeline')).toBeNull()
    expect(screen.queryByText(drafting.name)).toBeNull()
    const evidence = screen.getAllByText('Why this matches')[0].closest('details')!
    expect(evidence.open).toBe(false)
    await user.click(within(evidence).getByText('Why this matches'))
    expect(evidence.open).toBe(true)
    expect(within(evidence).getAllByRole('link').length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: 'Dismiss' })[0])
    await user.click(screen.getByRole('button', { name: 'Show 1 dismissed' }))
    await user.click(screen.getAllByRole('button', { name: 'Add to pipeline' })[0])
    expect(screen.getByRole('tab', { name: 'Application setup', selected: true })).toBeTruthy()
    expect(screen.queryByLabelText('Period start')).toBeNull()
    expect(screen.queryByText('Approved budget')).toBeNull()
  })

  it('tracks active applications separately from submitted and declined applications', async () => {
    const user = userEvent.setup()
    renderPage('/apply/applications')
    expect(screen.getByRole('link', { name: drafting.name })).toBeTruthy()
    expect(screen.queryByRole('link', { name: submitted.name })).toBeNull()
    expect(screen.queryByRole('link', { name: awarded.name })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Submitted/ }))
    expect(screen.getByRole('link', { name: submitted.name })).toBeTruthy()
    expect(screen.getByText('Awaiting a decision')).toBeTruthy()
    expect(screen.queryByText(/answers approved/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Declined/ }))
    expect(screen.getByRole('link', { name: declined.name })).toBeTruthy()
    await user.type(screen.getByRole('textbox', { name: 'Search applications' }), 'no-such-application')
    expect(screen.getByText('No applications match')).toBeTruthy()
  })

  it('creates a prospect without requiring award dates and opens application setup', async () => {
    const user = userEvent.setup()
    renderPage('/apply/applications')
    await user.click(screen.getByRole('button', { name: 'Add a prospect' }))
    const modal = screen.getByRole('dialog', { name: 'Add a prospect' })
    expect(within(modal).queryByLabelText('Funding period start')).toBeNull()
    expect(within(modal).queryByRole('option', { name: 'Awarded' })).toBeNull()
    await user.type(within(modal).getByRole('textbox', { name: 'Grant name' }), 'Community grant')
    await user.type(within(modal).getByRole('textbox', { name: 'Funder' }), 'Community foundation')
    await user.type(within(modal).getByRole('textbox', { name: 'Grant amount' }), '12000')
    await user.click(within(modal).getByRole('button', { name: 'Add prospect' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Community grant' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Application setup', selected: true })).toBeTruthy()
    expect(screen.queryByText('Award amount')).toBeNull()
  })

  it('limits application tabs, preserves hidden award data on save, and reveals finance after award', async () => {
    const user = userEvent.setup()
    renderPage(`/grants/${drafting.id}?tab=budget`)
    expect(screen.getByRole('tab', { name: /^Application/, selected: true })).toBeTruthy()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.queryByText('Shared-cost allocation')).toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Application setup' }))
    expect(screen.queryByLabelText('Period start')).toBeNull()
    expect(screen.queryByLabelText('Funder fiscal year starts')).toBeNull()
    const amount = screen.getByRole('spinbutton', { name: 'Requested amount' })
    await user.clear(amount)
    await user.type(amount, '125000')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!).grants.find((g: { id: string }) => g.id === drafting.id)
    expect(saved.amount).toBe(125000)
    expect(saved.categories).toEqual(drafting.categories)
    expect(saved.periodStart).toBe(drafting.periodStart)
    expect(saved.periodEnd).toBe(drafting.periodEnd)
    expect(saved.deadlines).toEqual(drafting.deadlines)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Grant stage' }), 'awarded')
    expect(screen.getByRole('tab', { name: 'Budget & spending' })).toBeTruthy()
    expect(screen.getByLabelText('Period start')).toBeTruthy()
    expect(screen.getByText('Approved budget')).toBeTruthy()
  })

  it('keeps fact search and category filtering without placeholder panels', async () => {
    const user = userEvent.setup()
    renderPage('/apply/knowledge')
    expect(screen.queryByText('Writing style')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fact category' }), 'mission')
    const fact = seedState.facts.find((f) => f.category === 'mission')!
    expect(screen.getByRole('button', { name: new RegExp(`^${fact.title}`) })).toBeTruthy()
    await user.type(screen.getByRole('textbox', { name: 'Search facts' }), 'no-such-fact')
    expect(screen.getByText('No facts match')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect((screen.getByRole('combobox', { name: 'Fact category' }) as HTMLSelectElement).value).toBe('all')
  })
})
