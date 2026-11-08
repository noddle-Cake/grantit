import Papa from 'papaparse'
import { fmtDate } from '@grantit/shared/format'
import type { GrantReport } from '@grantit/shared/funds'
import type { Grant } from '@grantit/shared/types'

// Exports of the funder report. All three formats are built from the same GrantReport (shared/src/funds.ts) the
// screen shows, with the same columns: Category | Budget | This period | Cumulative | Remaining, then exclusions.

export function downloadFile(name: string, content: string | Blob, type = 'text/csv') {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const REPORT_COLUMNS = ['Category', 'Budget', 'This period', 'Cumulative', 'Remaining'] as const

const fileBase = (g: Grant, r: GrantReport) => `${g.name.replace(/\W+/g, '-')}-${r.period.start}-to-${r.period.end}`
const periodLine = (r: GrantReport) => `${fmtDate(r.period.start)} – ${fmtDate(r.period.end)} (${r.period.label})`
const exclusionRows = (r: GrantReport) => r.excluded.map((l) => [fmtDate(l.tx.date), l.tx.vendor, l.tx.description, l.detail, l.amount] as const)

export function reportCsv(g: Grant, orgName: string, r: GrantReport): string {
  return Papa.unparse([
    ['Expenditure report', g.name],
    ['Funder', g.funder],
    ['Organization', orgName],
    ['Reporting period', periodLine(r)],
    [],
    [...REPORT_COLUMNS],
    ...r.rows.map((x) => [x.name, x.budget, x.thisPeriod, x.cumulative, x.remaining]),
    ['Total', r.totals.budget, r.totals.thisPeriod, r.totals.cumulative, r.totals.remaining],
    ...(r.excluded.length ? [[], ['Excluded from this report'], ['Date', 'Vendor', 'Description', 'Reason', 'Amount'], ...exclusionRows(r).map((x) => [...x])] : []),
  ])
}

/** The .xlsx sheet: the same rows and columns as the on-screen report. */
export function reportSheet(g: Grant, orgName: string, r: GrantReport) {
  const money = '[$$-409]#,##0.00'
  const bold = (value: string) => ({ value, fontWeight: 'bold' as const })
  const num = (value: number, b = false) => ({ value, format: money, ...(b ? { fontWeight: 'bold' as const } : {}) })
  const data = [
    [{ value: `Expenditure report: ${g.name}`, fontWeight: 'bold' as const, fontSize: 14 }],
    [`${g.funder} · ${orgName}`],
    [periodLine(r)],
    [],
    REPORT_COLUMNS.map(bold),
    ...r.rows.map((x) => [x.name, num(x.budget), num(x.thisPeriod), num(x.cumulative), num(x.remaining)]),
    [bold('Total'), num(r.totals.budget, true), num(r.totals.thisPeriod, true), num(r.totals.cumulative, true), num(r.totals.remaining, true)],
    ...(r.excluded.length
      ? [[], [bold('Excluded from this report')], ['Date', 'Vendor', 'Description', 'Reason', 'Amount'].map(bold), ...exclusionRows(r).map(([d, v, desc, reason, amt]) => [d, v, desc, reason, num(amt)])]
      : []),
  ]
  return { data, columns: [{ width: 34 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }] }
}

export async function downloadReportXlsx(g: Grant, orgName: string, r: GrantReport) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const { data, columns } = reportSheet(g, orgName, r)
  await writeExcelFile(data, { columns }).toFile(`${fileBase(g, r)}.xlsx`)
}

/** The PDF document: title block, the report table with totals, then exclusions. */
export async function reportPdf(g: Grant, orgName: string, r: GrantReport) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  doc.setFontSize(15)
  doc.text(`Expenditure report: ${g.name}`, 48, 56)
  doc.setFontSize(10)
  doc.text(`${g.funder} · ${orgName}`, 48, 74)
  doc.text(periodLine(r), 48, 89)
  autoTable(doc, {
    startY: 106,
    head: [[...REPORT_COLUMNS]],
    body: r.rows.map((x) => [x.name, usd(x.budget), usd(x.thisPeriod), usd(x.cumulative), usd(x.remaining)]),
    foot: [['Total', usd(r.totals.budget), usd(r.totals.thisPeriod), usd(r.totals.cumulative), usd(r.totals.remaining)]],
    // Right-align every money column, in the header and total row as well as the body.
    didParseCell: (cell) => {
      if (cell.column.index > 0) cell.cell.styles.halign = 'right'
    },
    headStyles: { fillColor: [33, 51, 67] },
    footStyles: { fillColor: [235, 240, 245], textColor: [33, 51, 67] },
    styles: { fontSize: 9 },
  })
  if (r.excluded.length) {
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24
    doc.setFontSize(11)
    doc.text('Excluded from this report', 48, y)
    autoTable(doc, {
      startY: y + 8,
      head: [['Date', 'Vendor', 'Description', 'Reason', 'Amount']],
      body: exclusionRows(r).map(([d, v, desc, reason, amt]) => [d, v, desc, reason, usd(amt)]),
      didParseCell: (cell) => {
        if (cell.column.index === 4) cell.cell.styles.halign = 'right'
      },
      headStyles: { fillColor: [96, 108, 120] },
      styles: { fontSize: 8.5 },
    })
  }
  return doc
}

export async function downloadReportPdf(g: Grant, orgName: string, r: GrantReport) {
  ;(await reportPdf(g, orgName, r)).save(`${fileBase(g, r)}.pdf`)
}

export function downloadReportCsv(g: Grant, orgName: string, r: GrantReport) {
  downloadFile(`${fileBase(g, r)}.csv`, reportCsv(g, orgName, r))
}
