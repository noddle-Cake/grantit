import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Field, Input } from './Form'

it('keeps the field label separate from its accessible hint and preserves explicit IDs', () => {
  render(<><Field label="Title" hint="Use a verifiable statement"><Input id="fact-title" aria-describedby="extra" /></Field><span id="extra">Required</span></>)
  const field = screen.getByRole('textbox', { name: 'Title' })
  expect(screen.getByLabelText('Title')).toBe(field)
  expect(field.id).toBe('fact-title')
  expect(field.getAttribute('aria-describedby')?.split(' ').map((id) => document.getElementById(id)?.textContent).join(' ')).toBe('Required Use a verifiable statement')
})
