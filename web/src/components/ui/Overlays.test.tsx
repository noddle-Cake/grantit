import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Drawer, Modal } from './Overlays'

function Example({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  return <>
    <button onClick={() => setOpen(true)}>Edit</button>
    <Drawer open={open} title="Edit fact" onClose={() => setOpen(false)}>
      <fieldset disabled={disabled}><input aria-label="Title" /></fieldset>
      <button onClick={() => setOpen(false)}>Done</button>
    </Drawer>
  </>
}

describe('native dialogs', () => {
  it('opens modally, focuses an editable field, and restores the opener and scroll state', async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('dialog', { name: 'Edit fact' }).hasAttribute('open')).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Title' }))
    expect(document.body.style.overflow).toBe('hidden')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit' }))
    expect(document.body.style.overflow).toBe('')
  })

  it('does not attempt to focus fields disabled by their parent fieldset', async () => {
    const user = userEvent.setup()
    render(<Example disabled />)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
  })

  it('handles the native Escape cancel event and backdrop dismissal', async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(screen.getByRole('dialog'), cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not dismiss when clicking inside a centered modal', async () => {
    const user = userEvent.setup()
    render(<Modal open label="Import" onClose={() => { throw new Error('Unexpected dismissal') }}><button>Choose file</button></Modal>)
    await user.click(screen.getByRole('button', { name: 'Choose file' }))
    expect(screen.getByRole('dialog', { name: 'Import' })).toBeTruthy()
  })

  it('does not discard a task when a pointer drag starts inside and ends on the backdrop', () => {
    render(<Modal open label="Edit" onClose={() => { throw new Error('Unexpected dismissal') }}><input aria-label="Statement" /></Modal>)
    fireEvent.pointerDown(screen.getByRole('textbox'))
    fireEvent.pointerUp(screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog', { name: 'Edit' })).toBeTruthy()
  })
})
