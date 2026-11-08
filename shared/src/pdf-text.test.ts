import { describe, expect, it } from 'vitest'
import { findQuote, fold, itemSpans, joinItems, locateQuote, splitSentences, toPassages } from './pdf-text.ts'

describe('joinItems', () => {
  it('joins lines with a space, keeps hyphenated line ends together, and records item offsets', () => {
    const items = [
      { str: 'Families who completed', hasEOL: true },
      { str: 'counseling reported a 38% drop in after-', hasEOL: true },
      { str: 'school conflict.', hasEOL: false },
    ]
    const page = joinItems(items)
    expect(page.text).toBe('Families who completed counseling reported a 38% drop in after-school conflict.')
    expect(page.starts).toEqual([0, 23, 63])
  })
})

describe('fold', () => {
  it('folds case, spacing, curly quotes, dashes and ligatures, mapping back to the original', () => {
    const f = fold('  The “ﬁrst”  year—2025 ')
    expect(f.text).toBe('the "first" year-2025')
    expect(f.map[0]).toBe(2)
    expect(f.map).toHaveLength(f.text.length)
  })
})

describe('findQuote', () => {
  const page = 'In the 2025–26 school year Tidepath reached 1,340 students. 81% of families earn below 200% of the poverty level.'

  it('finds a quote whatever its case, spacing and dash style', () => {
    const [r] = findQuote(page, 'tidepath  reached 1,340 STUDENTS')!
    expect(page.slice(r.start, r.end)).toBe('Tidepath reached 1,340 students')
    expect(findQuote(page, 'the 2025-26 school year')).not.toBeNull()
  })

  it('matches each part of an elided quote in order', () => {
    const ranges = findQuote(page, 'Tidepath reached 1,340 students … below 200% of the poverty level')!
    expect(ranges.map((r) => page.slice(r.start, r.end))).toEqual(['Tidepath reached 1,340 students', 'below 200% of the poverty level'])
    expect(findQuote(page, 'below 200% … Tidepath reached')).toBeNull()
  })

  it('ignores punctuation as a last resort but never changed words or figures', () => {
    expect(findQuote(page, 'reached 1,340 students; 81% of families')).not.toBeNull()
    expect(findQuote(page, 'Tidepath reached 1,430 students')).toBeNull()
    expect(findQuote(page, 'Tidepath served 1,340 students')).toBeNull()
    expect(findQuote(page, '   ')).toBeNull()
  })
})

describe('locateQuote', () => {
  it('prefers the cited page but finds a quote on another one', () => {
    const pages = ['Mentors meet weekly.', 'Mentors meet weekly for a year.']
    expect(locateQuote(pages, 'mentors meet weekly', 2)?.page).toBe(2)
    expect(locateQuote(pages, 'for a year', 1)?.page).toBe(2)
    expect(locateQuote(pages, 'monthly', 1)).toBeNull()
  })
})

describe('itemSpans', () => {
  it('maps a range of the joined text to the characters of each item it covers', () => {
    const items = [
      { str: 'Of youth matched for a full', hasEOL: true },
      { str: 'year, 92% stayed in school.', hasEOL: false },
    ]
    const page = joinItems(items)
    const ranges = findQuote(page.text, 'a full year, 92%')!
    expect(itemSpans(page, items, ranges)).toEqual([
      { item: 0, from: 21, to: 27 },
      { item: 1, from: 0, to: 9 },
    ])
  })
})

describe('passages', () => {
  it('splits sentences without breaking decimals or abbreviations followed by lowercase', () => {
    expect(splitSentences('Budget is $1.6 million. It grew 4.5% vs. last year. Done!')).toEqual(['Budget is $1.6 million.', 'It grew 4.5% vs. last year.', 'Done!'])
  })

  it('cuts pages into passages of whole sentences that never cross pages', () => {
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} is here.`).join(' ')
    const ps = toPassages({ id: 'd1', name: 'Plan' }, [long, 'Short page.'], 200)
    expect(ps.every((p) => p.text.length <= 200)).toBe(true)
    expect(ps.filter((p) => p.page === 1).map((p) => p.text).join(' ')).toBe(long)
    expect(ps.at(-1)).toMatchObject({ id: 'd1:2:0', page: 2, docName: 'Plan', text: 'Short page.' })
  })
})
