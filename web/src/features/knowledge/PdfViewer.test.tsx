import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seedState } from '@grantit/shared/seed'
import { AppStoreProvider } from '@/store'
import { PdfViewer } from './PdfViewer'

const mocks = vi.hoisted(() => ({ openPdf: vi.fn(), loadBytes: vi.fn() }))
vi.mock('@/lib/doc-store', () => ({
  DocStoreError: class extends Error {},
  loadBytes: mocks.loadBytes,
  pruneDocs: vi.fn(async () => undefined),
}))
vi.mock('@/lib/pdf', () => ({
  openPdf: mocks.openPdf,
  pageItems: vi.fn(async () => [{ str: 'Our mission supports families.', hasEOL: true, width: 100, transform: [1, 0, 0, 12, 0, 20] }]),
  pdfjs: vi.fn(async () => ({ Util: { transform: () => [1, 0, 0, 12, 0, 20] } })),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function document(rendered = Promise.resolve()) {
  const render = vi.fn(() => ({ promise: rendered, cancel: vi.fn() }))
  return {
    render,
    pdf: {
      numPages: 2,
      getPage: vi.fn(async () => ({
        getViewport: () => ({ width: 600, height: 800, transform: [1, 0, 0, 1, 0, 0] }),
        render,
      })),
    },
    close: vi.fn(),
  }
}

const doc = seedState.sourceDocs[0]
function viewer() {
  return render(<AppStoreProvider><PdfViewer
    review={{
      items: [{ id: 'c1', docId: doc.id, page: 1, quote: 'Our mission supports families.', claim: 'We support families.', verified: true }],
      index: 0, canCheck: true, onCheck: vi.fn(),
    }}
    onClose={vi.fn()}
  /></AppStoreProvider>)
}

beforeEach(() => {
  mocks.openPdf.mockReset()
  mocks.loadBytes.mockReset().mockResolvedValue(new ArrayBuffer(1))
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test-pdf'), revokeObjectURL: vi.fn() })
})

describe('PDF highlight lifecycle', () => {
  it('reports the highlight only after rendering and clears the message on another page', async () => {
    const user = userEvent.setup()
    const rendered = deferred<void>()
    const file = document(rendered.promise)
    mocks.openPdf.mockResolvedValue(file)
    viewer()
    await screen.findByRole('img', { name: 'Page 1' })
    await waitFor(() => expect(file.render).toHaveBeenCalled())
    expect(screen.queryByText(/and highlighted/)).toBeNull()
    await act(async () => rendered.resolve())
    await screen.findByText(/and highlighted/)
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.queryByText(/and highlighted/)).toBeNull()
    expect(screen.getByText(/Return to the cited page/)).toBeTruthy()
  })

  it('closes a PDF that finishes opening after the viewer unmounts', async () => {
    const opening = deferred<ReturnType<typeof document>>()
    mocks.openPdf.mockReturnValue(opening.promise)
    const view = viewer()
    await waitFor(() => expect(mocks.openPdf).toHaveBeenCalled())
    view.unmount()
    const file = document()
    await act(async () => opening.resolve(file))
    expect(file.close).toHaveBeenCalledOnce()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('shows a rendering error without claiming the quote is highlighted', async () => {
    const rendered = deferred<void>()
    const file = document(rendered.promise)
    mocks.openPdf.mockResolvedValue(file)
    viewer()
    await screen.findByRole('img', { name: 'Page 1' })
    await waitFor(() => expect(file.render).toHaveBeenCalled())
    await act(async () => rendered.reject(new Error('render failed')))
    expect((await screen.findByRole('alert')).textContent).toContain('couldn’t be rendered')
    expect(screen.queryByText(/and highlighted/)).toBeNull()
  })
})
