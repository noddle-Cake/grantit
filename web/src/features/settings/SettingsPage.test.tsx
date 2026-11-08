import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
import { APPEARANCE_KEY } from '@/lib/appearance'
import { AppStoreProvider } from '@/store'
import Settings from './SettingsPage'

afterEach(() => {
  delete document.documentElement.dataset.theme
})

it('changes the appearance from light to dark and back', () => {
  render(<AppStoreProvider><MemoryRouter><Settings /></MemoryRouter></AppStoreProvider>)
  const group = within(screen.getByRole('group', { name: 'Appearance' }))
  expect(group.getByRole('button', { name: 'System' }).getAttribute('aria-pressed')).toBe('true')

  fireEvent.click(group.getByRole('button', { name: 'Dark' }))
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem(APPEARANCE_KEY)).toBe('dark')
  expect(group.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true')

  fireEvent.click(group.getByRole('button', { name: 'Light' }))
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(localStorage.getItem(APPEARANCE_KEY)).toBe('light')
})
