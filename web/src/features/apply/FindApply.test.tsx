import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { seedState } from '@grantit/shared/seed'
import { AppStoreProvider } from '@/store'
import { STORAGE_KEY } from '@/store/migrate'
import type { AppState } from '@grantit/shared/types'
import GrantRecord from '@/features/grants/GrantRecordPage'
import KnowledgeBase from '@/features/knowledge/KnowledgeBasePage'
import Opportunities from './OpportunitiesPage'
import Applications from './ApplicationsPage'
import Dashboard from '@/features/dashboard/DashboardPage'
import { toISO } from '@grantit/shared/format'
import { demoOpportunities } from '@grantit/shared/opportunities-demo'

function renderPage(path: string) {
  return render(<AppStoreProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/apply" element={<Opportunities />} />
    <Route path="/apply/applications" element={<Applications />} />
    <Route path="/apply/knowledge" element={<KnowledgeBase />} />
    <Route path="/grants/:id" element={<GrantRecord />} />
    <Route path="/" element={<Dashboard />} />
  </Routes></MemoryRouter></AppStoreProvider>)
}

const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** The draft's sustainability answer was drafted while its funding fact was still a draft. */
function draftedBeforeApproval(factStatus: 'draft' | 'approved') {
  // Only the "Funding mix" fact covers sustainability, so its status alone decides whether the gap is open.
  const facts = seedState.facts.map((f) => (f.id === 'f-sustain' ? { ...f, status: factStatus } : { ...f, tags: f.tags.filter((t) => t !== 'sustainability') }))
  const grants = seedState.grants.map((g) =>
    g.id === drafting.id
      ? { ...g, questions: g.questions.map((q) => (q.id === 'q5' ? { ...q, answer: 'We will keep going.', status: 'draft' as const, missing: ['sustainability / funding plan'] } : q)) }
      : g,
  )
  saveState({ facts, grants })
}

const drafting = seedState.grants.find((g) => g.stage === 'drafting')!
const submitted = seedState.grants.find((g) => g.stage === 'submitted')!
const declined = seedState.grants.find((g) => g.stage === 'declined')!
const awarded = seedState.grants.find((g) => g.stage === 'awarded')!
const prospect = seedState.grants.find((g) => g.stage === 'prospect')!
const saveState = (patch: Partial<AppState>) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...seedState, ...patch }))
const pressed = (name: RegExp) => screen.getByRole('button', { name }).getAttribute('aria-pressed')

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
    const status = screen.getByRole('group', { name: 'Application status' })
    await user.click(within(status).getByRole('button', { name: /^Submitted/ }))
    expect(screen.getByRole('link', { name: submitted.name })).toBeTruthy()
    expect(screen.getByText('Awaiting a decision')).toBeTruthy()
    expect(screen.queryByText(/answers approved/)).toBeNull()
    await user.click(within(status).getByRole('button', { name: /^Declined/ }))
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
    renderPage('/apply/knowledge?status=all')
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

  it('opens the knowledge base on the approval queue for approvers, and on all facts for others', async () => {
    const user = userEvent.setup()
    const mission = seedState.facts.find((f) => f.category === 'mission' && f.status === 'approved')!
    const { unmount } = renderPage('/apply/knowledge')
    expect(pressed(/^Needs approval/)).toBe('true')
    expect(screen.queryByRole('button', { name: new RegExp(`^${mission.title}`) })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^All/ }))
    expect(screen.getByRole('button', { name: new RegExp(`^${mission.title}`) })).toBeTruthy()
    unmount()

    saveState({ currentUserId: 'u-denise' })
    renderPage('/apply/knowledge')
    expect(pressed(/^All/)).toBe('true')
  })

  it('lists applications by deadline across stages, shows owners, and filters to mine', async () => {
    const user = userEvent.setup()
    // Move the prospect's deadline ahead of the draft's: it should now be listed first.
    const draftDue = drafting.deadlines.find((d) => d.kind === 'application')!.date
    const earlier = { ...prospect, deadlines: [{ id: 'd-early', label: 'Letter of inquiry due', date: draftDue.replace(/\d\d$/, '01'), kind: 'application' as const }] }
    saveState({ grants: seedState.grants.map((g) => (g.id === prospect.id ? earlier : g)) })
    renderPage('/apply/applications')
    const names = screen.getAllByRole('link').map((l) => l.textContent)
    expect(names.indexOf(prospect.name)).toBeLessThan(names.indexOf(drafting.name))

    const owner = seedState.users.find((u) => u.id === prospect.ownerId)!
    expect(screen.getAllByText(owner.name).length).toBeGreaterThan(0)
    expect(pressed(/^Mine$/)).toBe('false')
    await user.click(screen.getByRole('button', { name: 'Mine' }))
    expect(pressed(/^Mine$/)).toBe('true')
    // The demo user is the director, who owns the draft but not the prospect.
    expect(screen.getByRole('link', { name: drafting.name })).toBeTruthy()
    expect(screen.queryByRole('link', { name: prospect.name })).toBeNull()
  })

  it('states fit as focus areas covered and shows funder requirements on each recommendation', () => {
    renderPage('/apply')
    expect(screen.queryByText(/% fit/)).toBeNull()
    expect(screen.getAllByText(/^\d+ of \d+ focus areas$/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Requirements').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^Source: /).length).toBeGreaterThan(0)
  })

  it('shows who acts next on each application and links to the question that needs work', () => {
    renderPage('/apply/applications')
    const row = (name: string) => screen.getByRole('link', { name }).closest('li')!
    // The demo user (director) owns the draft; program staff own the prospect.
    expect(within(row(drafting.name)).getByText('Your turn')).toBeTruthy()
    const luis = seedState.users.find((u) => u.id === prospect.ownerId)!
    expect(within(row(prospect.name)).getByText(`Waiting on ${luis.name.split(' ')[0]}`)).toBeTruthy()
    expect(within(row(drafting.name)).getByText(/answers ready$/)).toBeTruthy()
    const firstBlank = drafting.questions.find((q) => !q.answer.trim())!
    expect(screen.getByRole('link', { name: `Continue application: ${drafting.name}` }).getAttribute('href')).toBe(`/grants/${drafting.id}?tab=application#q-${firstBlank.id}`)
  })

  it('focuses the question named in the link when the application opens', () => {
    const target = drafting.questions[2]
    renderPage(`/grants/${drafting.id}?tab=application#q-${target.id}`)
    expect(document.activeElement?.id).toBe(`q-${target.id}`)
  })

  it('expands the secondary knowledge queue and keeps its approval action working', async () => {
    const user = userEvent.setup()
    renderPage('/apply/knowledge')
    expect(screen.getByText(/^Needed now ·/).closest('details')!.open).toBe(false)
    await user.click(screen.getByText(/^Needed now ·/))
    expect(screen.getByText(/^Needed now ·/).closest('details')!.open).toBe(true)
    const panel = screen.getByRole('list', { name: 'Needed now' })
    const pending = seedState.facts.find((f) => f.id === 'f-parents')!
    const item = within(panel).getByRole('button', { name: pending.title }).closest('li')!
    expect(item.textContent).toContain(`Blocks ${prospect.name}`)
    await user.click(within(item).getByRole('button', { name: 'Approve' }))
    expect(screen.queryByRole('list', { name: 'Needed now' })).toBeNull()
  })

  it('approves several facts at once', async () => {
    const user = userEvent.setup()
    renderPage('/apply/knowledge?status=all')
    const unapproved = seedState.facts.filter((f) => f.status !== 'approved')
    expect(unapproved.length).toBeGreaterThan(1)
    const approve = screen.getByRole('button', { name: 'Approve selected' }) as HTMLButtonElement
    expect(approve.disabled).toBe(true)
    await user.click(screen.getByRole('checkbox', { name: `Select ${unapproved[0].title}` }))
    expect(screen.getByRole('button', { name: 'Approve 1 fact' })).toBeTruthy()
    await user.click(screen.getByRole('checkbox', { name: 'Select all you can approve' }))
    await user.click(screen.getByRole('button', { name: `Approve ${unapproved.length} facts` }))
    expect(screen.getByRole('button', { name: /^Needs approval 0/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Draft 0/ })).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('shows what each fact is worth and flags finance facts over a year old', () => {
    const old = seedState.facts.find((f) => f.category === 'finance' && f.status === 'approved')!
    saveState({ facts: seedState.facts.map((f) => (f.id === old.id ? { ...f, updatedAt: '2024-01-15' } : f)) })
    renderPage('/apply/knowledge?status=all')
    const list = screen.getByRole('list', { name: 'Facts' })
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const row = (title: string) => within(list).getByRole('button', { name: new RegExp(`^${escape(title)}`) }).closest('li')!
    const parents = seedState.facts.find((f) => f.id === 'f-parents')!
    expect(row(parents.title).textContent).toMatch(/Unblocks 1 application · Strengthens \d+ match/)
    expect(screen.getAllByText(/Used in \d+ answers?/).length).toBeGreaterThan(0)
    expect(within(row(old.title)).getByText('Over a year old')).toBeTruthy()
    expect(screen.getAllByText('Over a year old')).toHaveLength(1)
  })

  it('offers to add a fact for a gap nothing covers, with the topic filled in', async () => {
    const user = userEvent.setup()
    const facts = seedState.facts.filter((f) => !f.tags.includes('sustainability'))
    saveState({ facts })
    renderPage('/apply/knowledge')
    expect(screen.getByText(/^Needed now ·/).closest('details')!.open).toBe(false)
    await user.click(screen.getByText(/^Needed now ·/))
    expect(screen.getByText(/^Needed now ·/).closest('details')!.open).toBe(true)
    const item = within(screen.getByRole('list', { name: 'Needed now' })).getByText('sustainability / funding plan').closest('li')!
    expect(item.textContent).toContain(`Blocks ${drafting.name}`)
    await user.click(within(item).getByRole('button', { name: 'Add fact' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('keeps attention filters compact and leaves stage counts to the status control', async () => {
    const user = userEvent.setup()
    // The draft is due in five days and has one written answer awaiting approval.
    saveState({
      grants: seedState.grants.map((g) =>
        g.id === drafting.id
          ? { ...g, deadlines: [{ id: 'd-soon', label: 'Application due', date: inDays(5), kind: 'application' as const }], questions: g.questions.map((q, i) => (i === 0 ? { ...q, answer: 'We help families.', status: 'draft' as const } : q)) }
          : g,
      ),
    })
    renderPage('/apply/applications')
    expect(screen.queryByRole('group', { name: 'Summary' })).toBeNull()
    const tiles = screen.getByRole('group', { name: 'Needs attention' })
    const tile = (label: string) => within(tiles).getByRole('button', { name: new RegExp(`^${label}`) })
    expect(tile('At risk').textContent).toMatch(/At risk 1/)
    expect(tile('Answers to approve').textContent).toMatch(/Answers to approve 1/)

    await user.click(tile('At risk'))
    expect(screen.getByRole('link', { name: drafting.name })).toBeTruthy()
    expect(screen.queryByRole('link', { name: prospect.name })).toBeNull()
    await user.click(tile('At risk'))
    expect(screen.getByRole('link', { name: prospect.name })).toBeTruthy()

    await user.click(tile('Answers to approve'))
    expect(screen.queryByRole('link', { name: prospect.name })).toBeNull()
    await user.click(within(screen.getByRole('group', { name: 'Application status' })).getByRole('button', { name: /^Submitted/ }))
    expect(screen.getByRole('link', { name: submitted.name })).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Application status' })).getByRole('button', { name: /^Submitted/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('tells the writer when facts a draft was missing get approved, on the question, the list, and Home', async () => {
    draftedBeforeApproval('approved')
    const { unmount } = renderPage('/apply/applications')
    const fresh = screen.getByRole('link', { name: /New facts for 1 answer/ })
    expect(fresh.getAttribute('href')).toBe(`/grants/${drafting.id}?tab=application#q-q5`)
    unmount()

    const record = renderPage(`/grants/${drafting.id}?tab=application#q-q5`)
    const question = document.getElementById('q-q5')!
    expect(within(question).getByText('New approved facts cover sustainability / funding plan.')).toBeTruthy()
    expect(within(question).getByRole('button', { name: 'Regenerate with new facts' })).toBeTruthy()
    expect(within(question).queryByText(/Missing information/)).toBeNull()
    record.unmount()

    renderPage('/')
    expect(screen.getByText(`${drafting.name}: new facts approved for 1 answer, regenerate to use them`)).toBeTruthy()
  })

  it('keeps reporting a gap as missing until a covering fact is approved', () => {
    draftedBeforeApproval('draft')
    renderPage(`/grants/${drafting.id}?tab=application`)
    const question = document.getElementById('q-q5')!
    expect(within(question).getByText(/No approved PDF or fact covers: sustainability \/ funding plan/)).toBeTruthy()
    expect(within(question).queryByText(/New approved facts/)).toBeNull()
  })

  it('keeps deadline warnings visible and discloses the detailed opportunity evidence', async () => {
    const user = userEvent.setup()
    // Put the draft's deadline on the soonest open recommendation's, so the clash holds whatever today's date is.
    const open = demoOpportunities.filter((o) => o.deadline >= toISO(new Date())).sort((a, b) => a.deadline.localeCompare(b.deadline))
    saveState({ grants: seedState.grants.map((g) => (g.id === drafting.id ? { ...g, deadlines: [{ id: 'd', label: 'Application due', date: open[0].deadline, kind: 'application' as const }] } : g)) })
    renderPage('/apply')
    const card = screen.getByRole('heading', { name: open[0].program }).closest('li')!
    expect(within(card).getByText(/application deadlines? within 7 days/)).toBeTruthy()
    expect(within(card).getByText('Why this matches').closest('details')!.open).toBe(false)
    await user.click(within(card).getByText('Why this matches'))
    const panel = screen.getByRole('region', { name: `Go / no-go: ${open[0].program}` })
    expect(within(panel).getByText('Requirements')).toBeTruthy()
    expect(panel.textContent).toMatch(/\d of \d with a related fact/)
    expect(panel.textContent).toMatch(new RegExp(`Within 7 days of [^·]*${drafting.name} \\(due `))
    expect(panel.textContent).toMatch(/your median award is \$[\d,]+/)
    expect(panel.textContent).toMatch(/If awarded: \w{3} \d{4} – \w{3} \d{4}/)
  })

  it('leaves dismissing matches to people who add prospects', () => {
    saveState({ currentUserId: 'u-denise' })
    renderPage('/apply')
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add to pipeline' })).toBeNull()
  })

  it('opens Applications on the budget view for finance: period, budget against request, money rules, and finance facts', async () => {
    const user = userEvent.setup()
    saveState({ currentUserId: 'u-denise' })
    renderPage('/apply/applications')
    expect(within(screen.getByRole('group', { name: 'Row details' })).getByRole('button', { name: 'Budget' }).getAttribute('aria-pressed')).toBe('true')
    const row = screen.getByRole('link', { name: drafting.name }).closest('li')!
    const total = drafting.categories.reduce((n, c) => n + c.budget, 0)
    expect(row.textContent).toContain(`Budget $${total.toLocaleString('en-US')} in ${drafting.categories.length} categories`)
    expect(within(row).getByRole('list', { name: 'Money rules' }).textContent).toContain('Indirect costs are not allowed.')
    expect(screen.getByRole('status').textContent).toContain('Finance facts')
    expect(screen.getByRole('link', { name: /Review finance facts/ }).getAttribute('href')).toBe('/apply/knowledge?status=all&category=finance')
    await user.click(screen.getByRole('button', { name: 'Progress' }))
    expect(screen.queryByRole('list', { name: 'Money rules' })).toBeNull()
  })

  it('keeps progress as the default and makes the alternative view optional for writers', async () => {
    const user = userEvent.setup()
    renderPage('/apply/applications')
    expect(screen.queryByRole('group', { name: 'Needs attention' })).toBeNull()
    expect(screen.getByText('View options').closest('details')!.open).toBe(false)
    await user.click(screen.getByText('View options'))
    expect(screen.getByText('View options').closest('details')!.open).toBe(true)
    expect(within(screen.getByRole('group', { name: 'Row details' })).getByRole('button', { name: 'Progress' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('Finance facts')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Budget' }))
    await user.click(screen.getByRole('button', { name: 'Progress' }))
    expect(screen.getByText('View options').closest('details')!.open).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Progress' }))
  })

  it('lets finance approve finance facts, filtered by a category link', () => {
    saveState({ currentUserId: 'u-denise' })
    renderPage('/apply/knowledge?status=all&category=finance')
    expect((screen.getByRole('combobox', { name: 'Fact category' }) as HTMLSelectElement).value).toBe('finance')
    const list = screen.getByRole('list', { name: 'Facts' })
    const draft = seedState.facts.find((f) => f.category === 'finance' && f.status !== 'approved')!
    const row = within(list).getByRole('button', { name: new RegExp(`^${draft.title}`) }).closest('li')!
    expect(within(row).getByRole('button', { name: 'Approve' })).toBeTruthy()
  })
})
