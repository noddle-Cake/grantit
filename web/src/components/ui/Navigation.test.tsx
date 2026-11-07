import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Segmented, Tabs } from './Navigation'

function NavigationExample({ segmented = false }: { segmented?: boolean }) {
  const [value, setValue] = useState('first')
  const choices = [{ id: 'first', label: 'First' }, { id: 'second', label: 'Second' }, { id: 'third', label: 'Third' }]
  return <>
    <button>Before</button>
    {segmented ? <Segmented label="View" options={choices} value={value} onChange={setValue} /> : <Tabs id="example" label="Details" tabs={choices} value={value} onChange={setValue} />}
    {!segmented && choices.map((c) => <div key={c.id} id={`example-${c.id}-panel`} role="tabpanel" aria-labelledby={`example-${c.id}-tab`} hidden={value !== c.id}>{c.label} content</div>)}
    <button>After</button>
  </>
}

describe('keyboard choice controls', () => {
  it('uses one tab stop, arrow-key wrapping, and Home/End for tabs', async () => {
    const user = userEvent.setup()
    render(<NavigationExample />)
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'First' }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Second' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').textContent).toBe('Second content')
    expect(screen.getByRole('tabpanel').id).toBe(screen.getByRole('tab', { name: 'Second' }).getAttribute('aria-controls'))
    await user.keyboard('{End}{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'First' }))
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Third' }))
    await user.keyboard('{Home}{Tab}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'After' }))
  })

  it('announces the pressed segment and changes it with arrow keys', async () => {
    const user = userEvent.setup()
    render(<NavigationExample segmented />)
    expect(screen.getByRole('group', { name: 'View' })).toBeTruthy()
    await user.tab()
    await user.tab()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'Second', pressed: true })).toBe(document.activeElement)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'After' }))
  })
})
