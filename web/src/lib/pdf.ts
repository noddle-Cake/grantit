// pdf.js, loaded on demand so it stays out of the main bundle. Page text is joined with the shared `joinItems`,
// the same layout drafting and verification use, so a quote found at draft time can be highlighted later.
import { joinItems, type PdfTextItem } from '@grantit/shared/pdf-text'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

type PdfJs = typeof import('pdfjs-dist')
let lib: Promise<PdfJs> | undefined

export function pdfjs(): Promise<PdfJs> {
  lib ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([m, worker]) => {
    m.GlobalWorkerOptions.workerSrc = worker.default
    return m
  })
  return lib
}

export interface OpenPdf {
  pdf: PDFDocumentProxy
  /** Free the document and its worker. */
  close: () => void
}

/** Open a PDF from its bytes. pdf.js takes ownership of the buffer it's given, so it gets a copy. */
export async function openPdf(bytes: ArrayBuffer): Promise<OpenPdf> {
  const { getDocument } = await pdfjs()
  const task = getDocument({ data: new Uint8Array(bytes.slice(0)) })
  try {
    return { pdf: await task.promise, close: () => void task.destroy() }
  } catch (e) {
    await task.destroy()
    throw e
  }
}

/** A page's text items (marked-content markers left out). */
export async function pageItems(page: PDFPageProxy) {
  const content = await page.getTextContent()
  return content.items.filter((it): it is (typeof content.items)[number] & PdfTextItem & { transform: number[]; width: number } => 'str' in it)
}

/** Every page's text, in order, joined the way drafting and highlighting expect. */
export async function extractPages(pdf: PDFDocumentProxy): Promise<string[]> {
  const pages: string[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    pages.push(joinItems(await pageItems(page)).text)
    page.cleanup()
  }
  return pages
}
