import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { AppStoreProvider } from '@/store'
import { ImportModal } from './ImportModal'

it('offers a keyboard-operated CSV chooser and skips the hidden file field for initial focus', async () => {
  const user = userEvent.setup()
  render(<AppStoreProvider><ImportModal open onClose={() => {}} /></AppStoreProvider>)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
  const openPicker = vi.spyOn(screen.getByLabelText('Choose CSV file'), 'click')
  screen.getByRole('button', { name: 'Choose a CSV file' }).focus()
  await user.keyboard('{Enter}')
  expect(openPicker).toHaveBeenCalledOnce()
})
