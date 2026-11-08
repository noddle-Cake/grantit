// ─── PDF text: one layout for drafting, verification and highlighting ─────────
// A page's text is joined from pdf.js text items by `joinItems`. The drafter is shown passages cut from that
// text, quotes are verified against it, and the viewer maps a found quote back to the items to draw the
// highlight. Using one join everywhere is what lets a quote found at draft time be highlighted later.

/** The parts of a pdf.js text item this module needs. */
export interface PdfTextItem {
  str: string
  hasEOL: boolean
}

export interface PageText {
  text: string
  /** Offset in `text` where each item starts (same order and length as the items). */
  starts: number[]
}

/** Items on a line are concatenated; a line end becomes a space, except after a hyphen. */
export function joinItems(items: PdfTextItem[]): PageText {
  let text = ''
  const starts: number[] = []
  for (const it of items) {
    starts.push(text.length)
    text += it.str
    if (it.hasEOL && text && !/[\s-]$/.test(text)) text += ' '
  }
  return { text: text.replace(/\s+$/, ''), starts }
}

// Characters that differ between a PDF and what a model copies from it.
const FOLD: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'", '′': "'",
  '“': '"', '”': '"', '„': '"', '″': '"',
  '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '−': '-',
  'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl',
  '…': '...',
}

/**
 * Text folded for matching, with a map from each folded character back to its index in the original.
 * `loose` also drops punctuation, so "families—58%" matches "families, 58%".
 */
export function fold(s: string, loose = false): { text: string; map: number[] } {
  let text = ''
  const map: number[] = []
  let space = true // drop leading spaces and collapse runs
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '­') continue // soft hyphen
    let out = FOLD[ch] ?? ch.toLowerCase()
    if (loose) out = out.replace(/[^\p{L}\p{N}\s]/gu, ' ')
    for (const c of out) {
      if (/\s/.test(c)) {
        if (space) continue
        space = true
        text += ' '
      } else {
        space = false
        text += c
      }
      map.push(i)
    }
  }
  if (text.endsWith(' ')) {
    text = text.slice(0, -1)
    map.pop()
  }
  return { text, map }
}

export interface Range {
  start: number
  end: number
}

function findIn(page: string, fragments: string[], loose: boolean): Range[] | null {
  const hay = fold(page, loose)
  const ranges: Range[] = []
  let from = 0
  for (const frag of fragments) {
    const needle = fold(frag, loose).text
    if (!needle) continue
    const at = hay.text.indexOf(needle, from)
    if (at < 0) return null
    const last = at + needle.length - 1
    ranges.push({ start: hay.map[at], end: hay.map[last] + 1 })
    from = at + needle.length
  }
  return ranges.length ? ranges : null
}

/**
 * Where a quote appears in a page's text, as ranges of the original text (one per fragment when the quote
 * elides with "..." or "…"), or null when it isn't there word for word. Case, spacing, curly quotes, dashes
 * and ligatures are ignored; failing that, punctuation is too.
 */
export function findQuote(page: string, quote: string): Range[] | null {
  const fragments = quote
    .split(/\.\.\.|…/)
    .map((f) => f.trim().replace(/^["'“‘]|["'”’]$/g, ''))
    .filter((f) => f.trim())
  if (!fragments.length) return null
  return findIn(page, fragments, false) ?? findIn(page, fragments, true)
}

/** The page (1-based) a quote is on, preferring `page`, or null when it's on none of them. */
export function locateQuote(pages: string[], quote: string, page: number): { page: number; ranges: Range[] } | null {
  const order = [page, ...pages.map((_, i) => i + 1).filter((p) => p !== page)]
  for (const p of order) {
    const text = pages[p - 1]
    const ranges = text === undefined ? null : findQuote(text, quote)
    if (ranges) return { page: p, ranges }
  }
  return null
}

/** Part of one text item covered by a range: characters `from` to `to` of item `item`. */
export interface ItemSpan {
  item: number
  from: number
  to: number
}

/** The text items (and the characters within them) that ranges of a joined page cover, for highlighting. */
export function itemSpans(page: PageText, items: PdfTextItem[], ranges: Range[]): ItemSpan[] {
  const spans: ItemSpan[] = []
  items.forEach((it, i) => {
    const s = page.starts[i]
    const e = s + it.str.length
    for (const r of ranges) {
      const from = Math.max(r.start, s)
      const to = Math.min(r.end, e)
      if (to > from) spans.push({ item: i, from: from - s, to: to - s })
    }
  })
  return spans
}

// ─── Passages ────────────────────────────────────────────────────────────────

export interface Passage {
  /** `${docId}:${page}:${n}` */
  id: string
  docId: string
  docName: string
  /** 1-based. */
  page: number
  text: string
}

export const splitSentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+(?=["'“(]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean)

/** Cut each page into passages of whole sentences, about `maxChars` long; passages never cross pages. */
export function toPassages(doc: { id: string; name: string }, pages: string[], maxChars = 900): Passage[] {
  const out: Passage[] = []
  pages.forEach((text, i) => {
    let buf = ''
    let n = 0
    const flush = () => {
      if (buf.trim()) out.push({ id: `${doc.id}:${i + 1}:${n++}`, docId: doc.id, docName: doc.name, page: i + 1, text: buf.trim() })
      buf = ''
    }
    for (const s of splitSentences(text)) {
      if (buf && buf.length + s.length + 1 > maxChars) flush()
      buf += (buf ? ' ' : '') + s
    }
    flush()
  })
  return out
}
