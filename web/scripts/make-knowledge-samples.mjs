// Generates the fictional knowledge-base PDFs drafts quote in the demo:
//   web/public/samples/tidepath-program-evaluation-2025-26.pdf
//   web/public/samples/tidepath-strategic-plan-2025-2028.pdf
// Run from the repo root: npm run samples:knowledge -w web
// Everything is invented and agrees with the approved facts in shared/src/seed.ts (same figures, same programs).
// Each paragraph is drawn line by line in Helvetica, so pdf.js extracts the text in reading order.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const W = 612
const H = 792
const M = 66
const teal = rgb(0.05, 0.36, 0.4)
const grey = rgb(0.38, 0.4, 0.44)
const ink = rgb(0.1, 0.12, 0.15)

function wrap(text, font, size, width) {
  const lines = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/**
 * @param {string} file
 * @param {{ title: string, subtitle: string, footer: string, date: string, pages: (string | { h: string } | { li: string })[][] }} spec
 */
async function makePdf(file, spec) {
  const doc = await PDFDocument.create()
  doc.setTitle(spec.title)
  doc.setAuthor('Tidepath Family Alliance (fictional)')
  doc.setSubject('Sample knowledge-base document for the Grantit demo')
  doc.setCreator('grantit/web/scripts/make-knowledge-samples.mjs')
  doc.setProducer('pdf-lib')
  doc.setCreationDate(new Date(spec.date))
  doc.setModificationDate(new Date(spec.date))
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  spec.pages.forEach((blocks, i) => {
    const page = doc.addPage([W, H])
    let y = H - M
    page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: teal })
    if (i === 0) {
      page.drawText(spec.title, { x: M, y: y - 20, size: 20, font: bold, color: teal })
      page.drawText(spec.subtitle, { x: M, y: y - 38, size: 10.5, font: regular, color: grey })
      y -= 66
    } else {
      page.drawText(spec.title, { x: M, y: y - 8, size: 8.5, font: regular, color: grey })
      y -= 30
    }
    for (const b of blocks) {
      if (typeof b === 'object' && 'h' in b) {
        y -= 6
        page.drawText(b.h, { x: M, y: y - 13, size: 13, font: bold, color: teal })
        y -= 24
        continue
      }
      const bullet = typeof b === 'object' && 'li' in b
      const str = bullet ? b.li : b
      const indent = bullet ? 16 : 0
      if (bullet) page.drawText('•', { x: M + 4, y: y - 10.5, size: 10.5, font: regular, color: ink })
      for (const line of wrap(str, regular, 10.5, W - 2 * M - indent)) {
        if (y < M + 30) throw new Error(`${file}: page ${i + 1} overflows; move a block to the next page`)
        page.drawText(line, { x: M + indent, y: y - 10.5, size: 10.5, font: regular, color: ink })
        y -= 15
      }
      y -= bullet ? 3 : 8
    }
    page.drawText(`${spec.footer} · Page ${i + 1} of ${spec.pages.length}`, { x: M, y: 38, size: 7.5, font: regular, color: grey })
  })

  const out = fileURLToPath(new URL(`../public/samples/${file}`, import.meta.url))
  writeFileSync(out, await doc.save({ useObjectStreams: false }))
  console.log(`Wrote ${out} (${spec.pages.length} pages)`)
}

await makePdf('tidepath-program-evaluation-2025-26.pdf', {
  title: '2025–26 Program Evaluation',
  subtitle: 'Tidepath Family Alliance · Prepared by Coral Ridge Evaluation Partners · June 2026',
  footer: 'Fictional document for demonstration only',
  date: '2026-06-18T12:00:00Z',
  pages: [
    [
      { h: 'Summary' },
      'Coral Ridge Evaluation Partners, an independent evaluator, reviewed all three of Tidepath Family Alliance’s programs for the 2025–26 school year: Anchor Mentors, family counseling, and the Safe & Strong school workshops.',
      'In the 2025–26 school year Tidepath reached 1,340 students through school workshops, 186 youth in mentoring matches, and 212 families in counseling. 81% of families we serve earn below 200% of the federal poverty level, and 58% speak Spanish or Haitian Creole at home.',
      'All three programs met or exceeded the targets set in Tidepath’s strategic plan. The main risk we found is capacity: demand for family counseling grew faster than therapist hours, and waits returned in the spring.',
      { h: 'Methods' },
      'Every workshop series used pre- and post-surveys of participating students. Partner schools shared attendance and enrollment data every quarter. We interviewed 24 mentors, 31 parents and caregivers, and 9 school counselors, and reviewed counseling intake and closing assessments.',
    ],
    [
      { h: 'Anchor Mentors' },
      'Anchor Mentors pairs youth ages 10 to 17 with screened, trained adult volunteers who meet weekly for at least 12 months. Of the 186 youth in mentoring matches, 141 reached the one-year mark, and the average match lasted 19 months.',
      'Of youth matched for a full year, 92% stayed enrolled in school and 74% improved their school attendance. Mentees missed an average of 6 fewer school days than in the year before they were matched.',
      'Mentors cited the monthly group outings as the main reason they stayed. Matches that attended at least six outings were twice as likely to reach the one-year mark.',
      { h: 'Family counseling' },
      'Licensed family therapists provided free short-term counseling of 8 to 12 sessions at both family centers and by telehealth, in English, Spanish, and Haitian Creole. Telehealth accounted for 41% of sessions, up from 22% the year before.',
      'Families who completed counseling reported a 38% average drop in household conflict, and 89% said they knew where to turn for help afterward. The average wait for a first session fell from 10 weeks to 3 weeks after two therapists joined in October 2025.',
    ],
    [
      { h: 'Safe & Strong school workshops' },
      'Safe & Strong reached 1,340 students in grades 4 to 12 across 14 partner schools. After the six-session series, 86% of students could name a trusted adult to go to for help, up from 61% before it began.',
      'Students who completed the series were also more likely to report knowing what to do if they were bullied online: 79% after the series, up from 48% before.',
      { h: 'Recommendations' },
      { li: 'Add therapist hours before expanding counseling to new schools, so waits stay under four weeks.' },
      { li: 'Keep telehealth as a standing option; families in the southern part of the county use it most.' },
      { li: 'Continue the Parent Connect pilot and measure caregiver outcomes with a short pre- and post-survey.' },
      { li: 'Track mentor retention by recruitment source to focus volunteer outreach.' },
    ],
  ],
})

await makePdf('tidepath-strategic-plan-2025-2028.pdf', {
  title: 'Strategic Plan 2025–2028',
  subtitle: 'Tidepath Family Alliance · Approved by the Board of Directors, January 2025',
  footer: 'Fictional document for demonstration only',
  date: '2025-01-22T12:00:00Z',
  pages: [
    [
      { h: 'Mission' },
      'Tidepath Family Alliance helps children and teens in Miami-Dade County and their families build safe, connected, and resilient lives through mentoring, family counseling, and safety and mental health workshops in schools.',
      { h: 'Who we are' },
      'Founded in 2011 by a school social worker and a group of parents, Tidepath began as a weekend mentoring club and now runs programs in 14 public schools and two family centers.',
      'Tidepath has 14 staff, including 6 licensed family therapists, and more than 160 trained volunteer mentors. Our annual budget is $1.6 million, and 83% of expenses go directly to programs.',
      { h: 'Goals for 2028' },
      { li: 'Bring Safe & Strong to 20 partner schools, up from 14, while keeping every series to six sessions.' },
      { li: 'Grow the Anchor Mentors volunteer corps to 220 trained mentors.' },
      { li: 'Keep the wait for a first family counseling session under four weeks.' },
      { li: 'Launch Parent Connect caregiver circles at both family centers.' },
    ],
    [
      { h: 'Sustainability and funding plan' },
      'No single funder will provide more than 20% of Tidepath’s budget. By 2028 we aim for individual donors to provide 30% of revenue, foundations 40%, and public contracts 30%.',
      'We will keep an operating reserve of at least three months of expenses, and we will only start a program a grant pays for when we have a plan to continue it after the grant ends, such as a school district contract, a renewable county agreement, or a named group of individual donors.',
      'Programs started with grant funds are reviewed by the board in their second year to decide whether to continue, scale, or close them.',
      { h: 'How we will measure progress' },
      'An external evaluator reviews every program each year. Each workshop series uses pre- and post-surveys, and partner schools share attendance data every quarter. The board reviews a dashboard of these measures at each quarterly meeting.',
    ],
  ],
})
