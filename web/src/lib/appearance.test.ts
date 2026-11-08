import { afterEach, expect, it, vi } from 'vitest'
import { APPEARANCE_KEY, applyAppearance, readAppearance, watchAppearance, writeAppearance } from './appearance'

const systemDark = (matches: boolean) => {
  const listeners: (() => void)[] = []
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches, addEventListener: (_: string, f: () => void) => listeners.push(f), removeEventListener: vi.fn() })))
  return listeners
}

afterEach(() => {
  delete document.documentElement.dataset.theme
})

it('follows the system appearance until a choice is saved', () => {
  systemDark(true)
  expect(readAppearance()).toBe('system')
  expect(applyAppearance()).toBe('dark')
  expect(document.documentElement.dataset.theme).toBe('dark')
})

it('switches from light to dark and back, and System clears the saved choice', () => {
  systemDark(false)
  writeAppearance('dark')
  expect(localStorage.getItem(APPEARANCE_KEY)).toBe('dark')
  expect(document.documentElement.dataset.theme).toBe('dark')
  writeAppearance('light')
  expect(document.documentElement.dataset.theme).toBe('light')
  writeAppearance('system')
  expect(localStorage.getItem(APPEARANCE_KEY)).toBeNull()
  expect(document.documentElement.dataset.theme).toBe('light')
})

it('ignores unknown stored values', () => {
  localStorage.setItem(APPEARANCE_KEY, 'sepia')
  expect(readAppearance()).toBe('system')
})

it('tracks OS changes only while on System', () => {
  let dark = false
  const listeners: (() => void)[] = []
  vi.stubGlobal('matchMedia', vi.fn(() => ({ get matches() { return dark }, addEventListener: (_: string, f: () => void) => listeners.push(f), removeEventListener: vi.fn() })))
  const stop = watchAppearance()
  applyAppearance()
  dark = true
  listeners.forEach((f) => f())
  expect(document.documentElement.dataset.theme).toBe('dark')
  writeAppearance('light')
  dark = false
  listeners.forEach((f) => f())
  dark = true
  listeners.forEach((f) => f())
  expect(document.documentElement.dataset.theme).toBe('light')
  stop()
})
