// @vitest-environment node
// The demo PDFs drafts quote, read with pdf.js the way the app reads them: they match the seed, agree with the
// facts they're the source of, and every quote the drafter takes from them is found again and maps to text items.
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { draftAnswer } from '@grantit/shared/drafting'
import { findQuote, itemSpans, joinItems, locateQuote, toPassages, type PdfTextItem } from '@grantit/shared/pdf-text'
import { seedState } from '@grantit/shared/seed'

interface Page {
  items: PdfTextItem[]
  joined: ReturnType<typeof joinItems>
}

async function read(path: string): Promise<Page[]> {
  const data = new Uint8Array(readFileSync(new URL(`../../../public/${path}`, import.meta.url)))
  const task = getDocument({ data, verbosity: 0 })
  const pdf = await task.promise
  const pages: Page[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const items = (await (await pdf.getPage(n)).getTextContent()).items.filter((it) => 'str' in it) as PdfTextItem[]
    pages.push({ items, joined: joinItems(items) })
  }
  await task.destroy()
  return pages
}

const docs = await Promise.all(seedState.sourceDocs.map(async (d) => ({ doc: d, pages: await read(d.sampleUrl!) })))
const text = (id: string) => docs.find((d) => d.doc.id === id)!.pages.map((p) => p.joined.text)

describe('demo knowledge-base PDFs', () => {
  it('match the page counts and sizes recorded in the seed', () => {
    for (const { doc, pages } of docs) {
      expect(pages).toHaveLength(doc.pages)
      expect(readFileSync(new URL(`../../../public/${doc.sampleUrl}`, import.meta.url)).length).toBe(doc.size)
    }
  })

  it('state the approved facts they are the source of, word for word', () => {
    const facts = (ids: string[]) => seedState.facts.filter((f) => ids.includes(f.id))
    const quoted = (docId: string, ids: string[]) => facts(ids).filter((f) => !locateQuote(text(docId), f.content, 1)).map((f) => f.id)
    expect(quoted('doc-evaluation-2026', ['f-beneficiaries', 'f-outcome-mentoring', 'f-outcome-counseling'])).toEqual([])
    expect(quoted('doc-strategic-plan', ['f-mission', 'f-history', 'f-capacity', 'f-evaluation'])).toEqual([])
  })

  it('give every quote the drafter takes a page it is found on and text items to highlight', () => {
    const passages = docs.flatMap(({ doc, pages }) => toPassages(doc, pages.map((p) => p.joined.text)))
    const wellness = seedState.grants.find((g) => g.id === 'g-wellness')!
    let quotes = 0
    for (const q of wellness.questions) {
      for (const c of draftAnswer(q, seedState.facts, passages).docCitations) {
        const page = docs.find((d) => d.doc.id === c.docId)!.pages[c.page - 1]
        const ranges = findQuote(page.joined.text, c.quote)
        expect(ranges, c.quote).not.toBeNull()
        expect(itemSpans(page.joined, page.items, ranges!).length).toBeGreaterThan(0)
        quotes++
      }
    }
    expect(quotes).toBeGreaterThan(3)
  })
})
