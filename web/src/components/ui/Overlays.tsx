import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

/** Native modality makes the background inert and contains keyboard and assistive-technology focus. */
export function Dialog({ open, onClose, label, labelledBy, className, children }: {
  open: boolean; onClose: () => void; label?: string; labelledBy?: string; className?: string; children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const backdropPress = useRef(false)

  useEffect(() => {
    if (!open) return
    const node = ref.current!
    const opener = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    node.showModal()
    // :disabled also excludes controls inside disabled fieldsets.
    const field = node.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="file"]):not(:disabled), textarea:not(:disabled), select:not(:disabled)')
    field?.focus()
    return () => {
      node.close()
      document.body.style.overflow = overflow
      // The opener may have disappeared after deleting a record or navigating.
      const target = opener?.isConnected && !opener.matches(':disabled') ? opener : document.querySelector<HTMLElement>('main')
      target?.focus()
      if (document.activeElement !== target) document.querySelector<HTMLElement>('main')?.focus()
    }
  }, [open])

  if (!open) return null
  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-label={label}
      aria-labelledby={labelledBy}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onPointerDown={(e) => { backdropPress.current = e.target === e.currentTarget }}
      onClick={(e) => { if (backdropPress.current && e.target === e.currentTarget) onClose() }}
      className={clsx('dialog-shell fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden overscroll-contain border-0 bg-transparent text-slate open:flex', className)}
    >
      {children}
    </dialog>
  )
}

/** HubSpot-style right side panel with navy header. */
export function Drawer({ open, title, onClose, children, footer, width = 480 }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  const titleId = useId()
  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} className="justify-end p-0">
      <div className="animate-slide-in relative flex h-full max-w-full min-w-0 flex-col bg-surface shadow-2xl" style={{ width }}>
        <header className="flex shrink-0 items-center justify-between gap-3 bg-obsidian-2 px-6 py-4 text-white">
          <h2 id={titleId} className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-white/10 focus-visible:outline-white">
            <X size={18} />
          </button>
        </header>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">{children}</div>
        {footer && <footer className="flex shrink-0 flex-wrap gap-2 border-t border-line-2 bg-canvas px-6 py-4">{footer}</footer>}
      </div>
    </Dialog>
  )
}

/** A focused task, bounded by the viewport even at large text sizes. */
export function Modal({ open, onClose, children, label, width = 560 }: { open: boolean; onClose: () => void; children: ReactNode; label: string; width?: number }) {
  return (
    <Dialog open={open} onClose={onClose} label={label} className="items-center justify-center p-4">
      <div className="animate-pop-in scrollbar-thin relative max-h-full w-full min-w-0 overflow-y-auto overscroll-contain rounded-2xl bg-surface shadow-2xl" style={{ maxWidth: width }}>
        {children}
      </div>
    </Dialog>
  )
}
