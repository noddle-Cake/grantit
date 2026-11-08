import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// JSDOM has no rendering engine or native modal top layer. These stubs test our lifecycle and initial
// focus; browser focus containment, inertness, scrolling and responsive layout still require visual QA.
beforeEach(() => {
  if (typeof window === 'undefined') return // a test running in the node environment (e.g. reading PDFs with pdf.js)
  localStorage.clear()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
    this.querySelector<HTMLElement>('button, a[href]')?.focus()
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  Element.prototype.scrollTo = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
