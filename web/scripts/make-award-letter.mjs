// Generates the fictional award letter used in the "Needs setup" demo:
//   web/public/samples/family-wellness-award-letter.pdf
// Run from the repo root: npm run samples:award-letter -w web
// The funder, people and numbers are invented and match the Family Wellness Partnership grant in shared/src/seed.ts.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const OUT = fileURLToPath(new URL('../public/samples/family-wellness-award-letter.pdf', import.meta.url))

const BUDGET = [
  ['Family Counselors', 32000],
  ['Parent Wellness Workshops', 12000],
  ['Interpretation & Outreach', 6000],
  ['Program Evaluation', 4000],
  ['Indirect Costs (10%)', 6000],
]
const AWARD = 60000
if (BUDGET.reduce((s, [, v]) => s + v, 0) !== AWARD) throw new Error('Budget lines must add up to the award')

const usd = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const doc = await PDFDocument.create()
doc.setTitle('Grant Award Letter – Family Wellness Partnership')
doc.setAuthor('Harborlight Community Trust (fictional)')
doc.setSubject('Sample award letter for the Grantit demo')
doc.setCreator('grantit/web/scripts/make-award-letter.mjs')
doc.setProducer('pdf-lib')
doc.setCreationDate(new Date('2026-09-15T12:00:00Z'))
doc.setModificationDate(new Date('2026-09-15T12:00:00Z'))

const regular = await doc.embedFont(StandardFonts.Helvetica)
const bold = await doc.embedFont(StandardFonts.HelveticaBold)
const navy = rgb(0.09, 0.2, 0.33)
const grey = rgb(0.35, 0.38, 0.42)
const ink = rgb(0.1, 0.12, 0.15)

const W = 612
const H = 792
const M = 64
let page = doc.addPage([W, H])
let y = H - M

function wrap(text, font, size, width) {
  const lines = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line)
        line = word
      } else line = next
    }
    lines.push(line)
  }
  return lines
}

function ensure(space) {
  if (y - space < M) {
    page = doc.addPage([W, H])
    y = H - M
    footer()
  }
}

function text(str, { font = regular, size = 10.5, color = ink, gap = 4, indent = 0 } = {}) {
  for (const line of wrap(str, font, size, W - 2 * M - indent)) {
    ensure(size + gap)
    page.drawText(line, { x: M + indent, y: y - size, size, font, color })
    y -= size + gap
  }
}

const space = (n = 8) => (y -= n)

function footer() {
  page.drawText('Harborlight Community Trust · 1200 Biscayne Shore Drive, Suite 400 · Miami, FL 33132 · Fictional organization for demonstration only', {
    x: M,
    y: 36,
    size: 7.5,
    font: regular,
    color: grey,
  })
}

// Letterhead
page.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: navy })
page.drawText('HARBORLIGHT', { x: M, y: y - 20, size: 20, font: bold, color: navy })
page.drawText('COMMUNITY TRUST', { x: M, y: y - 36, size: 11, font: regular, color: navy })
page.drawText('Grant Award Letter', { x: W - M - bold.widthOfTextAtSize('Grant Award Letter', 11), y: y - 20, size: 11, font: bold, color: grey })
page.drawText('Award No. HCT-2026-118', { x: W - M - regular.widthOfTextAtSize('Award No. HCT-2026-118', 9.5), y: y - 34, size: 9.5, font: regular, color: grey })
y -= 64
footer()

text('September 15, 2026')
space(10)
text('Claudette Pierre, Executive Director')
text('Tidepath Family Alliance')
text('Miami, FL')
space(12)
text('Re: Family Wellness Partnership — Notice of Grant Award', { font: bold })
space(8)
text('Dear Ms. Pierre,')
space(4)
text(
  'On behalf of the Board of Trustees of Harborlight Community Trust, I am pleased to inform you that Tidepath Family Alliance has been awarded a grant of $60,000.00 (sixty thousand dollars) in support of the Family Wellness Partnership, which provides family counseling and parent wellness workshops for families in Miami-Dade County.',
)
space(6)

text('Award terms', { font: bold, size: 12, color: navy })
space(2)
const terms = [
  ['Total award', usd(AWARD)],
  ['Grant period', 'October 1, 2026 through September 30, 2027'],
  ["Funder's fiscal year", 'October 1 – September 30 (Harborlight fiscal year begins in October)'],
  ['Payment schedule', 'Two equal installments: October 2026 and April 2027'],
  ['Shared costs', 'Costs may not be shared with or charged to other grants'],
]
for (const [k, v] of terms) {
  ensure(16)
  page.drawText(k, { x: M, y: y - 10.5, size: 10.5, font: bold, color: ink })
  page.drawText(v, { x: M + 140, y: y - 10.5, size: 10.5, font: regular, color: ink })
  y -= 16
}
space(8)

text('Approved budget', { font: bold, size: 12, color: navy })
text('Funds must be spent within the categories and amounts below. Spending outside these categories is not allowable.', { size: 9.5, color: grey })
space(4)
const colX = W - M - 110
const row = (label, amount, { font = regular, fill } = {}) => {
  ensure(20)
  if (fill) page.drawRectangle({ x: M, y: y - 16, width: W - 2 * M, height: 20, color: fill })
  page.drawText(label, { x: M + 8, y: y - 10, size: 10.5, font, color: ink })
  const a = typeof amount === 'number' ? usd(amount) : amount
  page.drawText(a, { x: colX + 102 - font.widthOfTextAtSize(a, 10.5), y: y - 10, size: 10.5, font, color: ink })
  y -= 20
}
row('Budget category', 'Approved amount', { font: bold, fill: rgb(0.92, 0.94, 0.96) })
for (const [label, amount] of BUDGET) row(label, amount)
page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.8, color: grey })
row('Total', AWARD, { font: bold })
space(10)

text('Reporting requirements', { font: bold, size: 12, color: navy })
space(2)
for (const r of [
  'Quarterly expenditure reports by budget category, due 30 days after the end of each Harborlight fiscal quarter (January 30, April 30, July 30 and October 30).',
  'A final narrative and financial report is due by October 31, 2027.',
  'Moving more than 10% of any category to another requires prior written approval from your program officer.',
  'Equipment purchases over $1,000 are not allowable under this award.',
]) {
  ensure(15)
  page.drawText('•', { x: M + 6, y: y - 10.5, size: 10.5, font: regular, color: ink })
  text(r, { indent: 18 })
}
space(10)
text(
  'Please sign and return the enclosed grant agreement within 30 days. We look forward to partnering with Tidepath Family Alliance and to hearing about the families this work will reach.',
)
space(16)
text('Sincerely,')
space(18)
text('Marisol Vance', { font: bold })
text('Senior Program Officer, Harborlight Community Trust')

writeFileSync(OUT, await doc.save({ useObjectStreams: false }))
console.log(`Wrote ${OUT} (${doc.getPageCount()} page${doc.getPageCount() === 1 ? '' : 's'})`)
