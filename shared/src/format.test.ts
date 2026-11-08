import { describe, expect, it } from 'vitest'
import { dateWithRelative, fmtDate, relativePhrase, toISO } from './format.ts'

const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toISO(d)
}

describe('dateWithRelative', () => {
  it('adds the relative label when it says something new', () => {
    expect(dateWithRelative(inDays(5))).toBe(`${fmtDate(inDays(5))} · In 5 days`)
  })

  it('shows the date once when the relative label falls back to it', () => {
    expect(dateWithRelative(inDays(90))).toBe(fmtDate(inDays(90)))
  })
})

describe('relativePhrase', () => {
  it('reads naturally after "Due"', () => {
    expect(relativePhrase(inDays(5))).toBe('in 5 days')
    expect(relativePhrase(inDays(0))).toBe('today')
    expect(relativePhrase(inDays(1))).toBe('tomorrow')
    expect(relativePhrase(inDays(90))).toBe(fmtDate(inDays(90)))
  })
})
