import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { toPassages } from '@grantit/shared/pdf-text'
import { seedState } from '@grantit/shared/seed'
import type { DocCitation } from '@grantit/shared/types'
import { AppStoreProvider } from '@/store'
import { STORAGE_KEY } from '@/store/migrate'
import GrantRecord from './GrantRecordPage'

// pdf.js needs a real browser; the page text the drafter gets is stubbed (samples.test.ts covers the real PDFs).
const planPages = [
  'Mission Tidepath Family Alliance helps children and teens in Miami-Dade County and their families build safe, connected, and resilient lives.',
  'Sustainability and funding plan No single funder will provide more than 20% of Tidepath’s budget. We will only start a program a grant pays for when we have a plan to continue it after the grant ends, such as a school district contract.',
]
vi.mock('@/lib/doc-store', () => ({
  DocStoreError: class extends Error {},
  pruneDocs: vi.fn(async () => undefined),
  loadBytes: vi.fn(async () => Promise.reject(new Error('no PDF in tests'))),
  approvedSources: vi.fn(async () => ({
    passages: toPassages({ id: 'doc-strategic-plan', name: 'Strategic Plan 2025–2028' }, planPages),
    pages: new Map([['doc-strategic-plan', planPages]]),
    unreadable: [],
  })),
}))

const grant = seedState.grants.find((g) => g.id === 'g-wellness')!

function renderGrant(citations?: DocCitation[]) {
  if (citations) {
    const grants = seedState.grants.map((g) =>
      g.id === grant.id
        ? { ...g, questions: g.questions.map((q) => (q.id === 'q5' ? { ...q, answer: 'No single funder provides more than 20% of our budget.', status: 'draft' as const, docCitations: citations } : q)) }
        : g,
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...seedState, grants }))
  }
  return render(<AppStoreProvider><MemoryRouter initialEntries={[`/grants/${grant.id}?tab=application`]}><Routes>
    <Route path="/grants/:id" element={<GrantRecord />} />
  </Routes></MemoryRouter></AppStoreProvider>)
}

const cite: DocCitation = { id: 'c1', docId: 'doc-strategic-plan', page: 2, quote: 'No single funder will provide more than 20% of Tidepath’s budget', claim: 'No single funder provides more than 20% of our budget.', verified: false }

describe('PDF citations on answers', () => {
  it('drafts from approved PDFs and lists each quote with its page', async () => {
    const user = userEvent.setup()
    renderGrant()
    const question = document.getElementById('q-q5')!
    await user.click(within(question).getByRole('button', { name: 'Generate draft' }))
    const list = await within(question).findByRole('list', { name: 'PDF citations' }, { timeout: 3000 })
    const first = within(list).getAllByRole('button')[0]
    expect(first.getAttribute('aria-label')).toMatch(/Strategic Plan 2025–2028, page 2\. To review$/)
    expect(within(question).getByText('0 of', { exact: false }).textContent).toMatch(/^0 of \d+ reviewed$/)
    expect(within(question).queryByText(/No approved PDF or fact covers: sustainability/)).toBeNull()
  })

  it('holds back an answer whose quote was not found until a reviewer confirms it against the PDF', async () => {
    const user = userEvent.setup()
    renderGrant([cite])
    const question = document.getElementById('q-q5')!
    expect(within(question).getByText('1 PDF citation to check.')).toBeTruthy()
    expect((within(question).getByRole('button', { name: 'Approve answer' }) as HTMLButtonElement).disabled).toBe(true)

    await user.click(within(question).getByRole('button', { name: 'Check' }))
    const dialog = screen.getByRole('dialog', { name: 'Check citation' })
    expect(within(dialog).getByText(cite.claim)).toBeTruthy()
    expect(within(dialog).getByText(/wasn’t found word for word/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Supports it' }))
    expect(within(dialog).getByText('Supports the sentence')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    expect(within(question).queryByText('1 PDF citation to check.')).toBeNull()
    expect(within(question).getByText('1 of 1 reviewed')).toBeTruthy()
    expect((within(question).getByRole('button', { name: 'Approve answer' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('blocks an answer a reviewer marked as not supported by its quote', async () => {
    const user = userEvent.setup()
    renderGrant([{ ...cite, verified: true }])
    const question = document.getElementById('q-q5')!
    expect((within(question).getByRole('button', { name: 'Approve answer' }) as HTMLButtonElement).disabled).toBe(false)
    await user.click(within(question).getByRole('button', { name: 'Review citations' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Check citation' })).getByRole('button', { name: 'Doesn’t support it' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(within(question).getByText(/A reviewer marked a quote as not supporting its sentence/)).toBeTruthy()
    expect((within(question).getByRole('button', { name: 'Approve answer' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
