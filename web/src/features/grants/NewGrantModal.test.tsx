import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import { AppStoreProvider } from '@/store'
import { NewGrantModal } from './NewGrantModal'

it('names the fields and explains why creation is disabled, including cleared dates', () => {
  render(<AppStoreProvider><MemoryRouter><NewGrantModal open onClose={() => {}} /></MemoryRouter></AppStoreProvider>)
  const create = screen.getByRole('button', { name: 'Create grant' }) as HTMLButtonElement
  const reason = () => document.getElementById(create.getAttribute('aria-describedby')!)?.textContent
  expect(create.disabled).toBe(true)
  expect(reason()).toBe('Enter a grant name.')
  fireEvent.change(screen.getByRole('textbox', { name: 'Grant name' }), { target: { value: 'New grant' } })
  expect(reason()).toBe('Enter a funder.')
  fireEvent.change(screen.getByRole('textbox', { name: 'Funder' }), { target: { value: 'Foundation' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Grant amount' }), { target: { value: '12000' } })
  expect(create.disabled).toBe(false)
  fireEvent.change(screen.getByLabelText('Funding period start'), { target: { value: '' } })
  expect(create.disabled).toBe(true)
  expect(reason()).toBe('Choose a funding end date after the start date.')
})
