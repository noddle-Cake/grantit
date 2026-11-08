// Knowledge-base PDFs and their page text, kept in this browser's IndexedDB (the app state in localStorage holds
// only each document's details; files are too big for it). Demo PDFs are fetched from the app's samples folder
// instead, and their text is cached here after the first read. Until documents move to the API, a PDF uploaded
// in one browser can't be opened in another.
import { toPassages, type Passage } from '@grantit/shared/pdf-text'
import type { SourceDoc } from '@grantit/shared/types'
import { extractPages, openPdf } from './pdf'

const DB_NAME = 'grantit-docs'
const FILES = 'files'
const TEXT = 'text'

/** A failure the knowledge base shows as-is. */
export class DocStoreError extends Error {}

let db: Promise<IDBDatabase> | undefined

function openDb(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new DocStoreError('This browser can’t store PDFs (IndexedDB is unavailable).'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(FILES)
      req.result.createObjectStore(TEXT)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(new DocStoreError('This browser blocked storing PDFs. Private windows often do.'))
  })
  db.catch(() => (db = undefined))
  return db
}

function run<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (d) =>
      new Promise((resolve, reject) => {
        const tx = d.transaction(store, mode)
        const req = op(tx.objectStore(store))
        tx.oncomplete = () => resolve(req ? req.result : undefined)
        tx.onerror = () => reject(new DocStoreError(tx.error?.name === 'QuotaExceededError' ? 'This browser is out of space for PDFs. Delete some, or free up disk space.' : 'Couldn’t save the PDF in this browser.'))
      }),
  )
}

const textCache = new Map<string, Promise<string[]>>()

/** Save an uploaded PDF and its page text. */
export async function saveDoc(id: string, file: Blob, pages: string[]) {
  await run(FILES, 'readwrite', (s) => s.put(file, id))
  await run(TEXT, 'readwrite', (s) => s.put(pages, id))
  textCache.set(id, Promise.resolve(pages))
}

/** The PDF's bytes: the bundled sample, or the file uploaded in this browser. */
export async function loadBytes(doc: SourceDoc): Promise<ArrayBuffer> {
  if (doc.sampleUrl) {
    const res = await fetch(`${import.meta.env.BASE_URL}${doc.sampleUrl}`).catch(() => null)
    if (!res?.ok) throw new DocStoreError(`Couldn’t load “${doc.name}”. Check your connection.`)
    return res.arrayBuffer()
  }
  const blob = await run<Blob>(FILES, 'readonly', (s) => s.get(doc.id))
  if (!blob) throw new DocStoreError(`“${doc.name}” was uploaded in another browser. PDFs stay in the browser they were uploaded from for now.`)
  return blob.arrayBuffer()
}

/** Each page's text: from this browser's cache, or read from the PDF once and cached. */
export function loadPages(doc: SourceDoc): Promise<string[]> {
  let p = textCache.get(doc.id)
  if (!p) {
    p = (async () => {
      const saved = await run<string[]>(TEXT, 'readonly', (s) => s.get(doc.id)).catch(() => undefined)
      if (saved) return saved
      const { pdf, close } = await openPdf(await loadBytes(doc))
      try {
        const pages = await extractPages(pdf)
        await run(TEXT, 'readwrite', (s) => s.put(pages, doc.id)).catch(() => undefined) // a cache only
        return pages
      } finally {
        close()
      }
    })()
    p.catch(() => textCache.delete(doc.id))
    textCache.set(doc.id, p)
  }
  return p
}

export interface Sources {
  passages: Passage[]
  /** Page text by document id, for checking quotes. */
  pages: Map<string, string[]>
  /** Approved PDFs that couldn't be read here (e.g. uploaded in another browser). */
  unreadable: SourceDoc[]
}

/** Passages of the approved PDFs, ready for drafting. A PDF that can't be read is skipped and reported. */
export async function approvedSources(docs: SourceDoc[]): Promise<Sources> {
  const approved = docs.filter((d) => d.status === 'approved')
  const results = await Promise.all(approved.map((d) => loadPages(d).then((pages) => ({ d, pages }), () => ({ d, pages: null }))))
  const pages = new Map<string, string[]>()
  const unreadable: SourceDoc[] = []
  for (const { d, pages: p } of results) {
    if (p) pages.set(d.id, p)
    else unreadable.push(d)
  }
  return { passages: approved.flatMap((d) => (pages.has(d.id) ? toPassages(d, pages.get(d.id)!) : [])), pages, unreadable }
}

/** Delete stored PDFs no longer in the app state (deleted documents once Undo is gone, or a demo reset). */
export async function pruneDocs(keep: string[]) {
  const ids = (await run<IDBValidKey[]>(FILES, 'readonly', (s) => s.getAllKeys()).catch(() => undefined)) ?? []
  const stale = ids.filter((id) => !keep.includes(String(id)))
  for (const id of stale) {
    await run(FILES, 'readwrite', (s) => s.delete(id)).catch(() => undefined)
    await run(TEXT, 'readwrite', (s) => s.delete(id)).catch(() => undefined)
    textCache.delete(String(id))
  }
}
