import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { fmtDate, todayISO } from '@grantit/shared/format'
import { CALENDAR_CONNECTIONS_KEY } from '@/lib/calendar-connections'
import { AppStoreProvider } from '@/store'
import CalendarPage from './CalendarPage'

const renderPage = () => render(<AppStoreProvider><MemoryRouter><CalendarPage /></MemoryRouter></AppStoreProvider>)

afterEach(() => {
  localStorage.removeItem(CALENDAR_CONNECTIONS_KEY)
  vi.useRealTimers()
})

it('shows the current month with today selected', () => {
  renderPage()
  const today = todayISO()
  expect(screen.getByRole('heading', { name: fmtDate(today, { month: 'long', year: 'numeric' }) })).toBeTruthy()
  const day = screen.getByRole('button', { name: new RegExp(`^${fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}, today`) })
  expect(day.getAttribute('aria-current')).toBe('date')
  expect(day.getAttribute('tabindex')).toBe('0')
})

it('moves between days and months with the keyboard', () => {
  renderPage()
  const grid = screen.getByRole('grid', { name: 'Month' })
  const heading = () => screen.getByRole('heading', { level: 2 }).textContent
  const start = heading()
  fireEvent.keyDown(grid, { key: 'PageDown' })
  expect(heading()).not.toBe(start)
  fireEvent.keyDown(grid, { key: 'PageUp' })
  expect(heading()).toBe(start)
})

it('connects Google Calendar through the simulated sign-in and remembers it', () => {
  vi.useFakeTimers()
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: 'Connect Google Calendar' }))
  const dialog = within(screen.getByRole('dialog', { name: 'Connect Google Calendar' }))
  fireEvent.click(dialog.getByRole('button', { name: 'Continue to Google' }))
  act(() => { vi.advanceTimersByTime(1200) })
  fireEvent.click(dialog.getByRole('button', { name: 'Connect calendar' }))

  expect(screen.getByRole('button', { name: 'Disconnect Google Calendar' })).toBeTruthy()
  const saved = JSON.parse(localStorage.getItem(CALENDAR_CONNECTIONS_KEY)!)
  expect(saved).toMatchObject([{ provider: 'google', showTheirEvents: true }])
  // Their meetings join the legend once a calendar shares its events.
  expect(screen.getByRole('button', { name: 'Your calendars' })).toBeTruthy()
})
