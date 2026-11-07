import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'

// ─── Overlays ───────────────────────────────────────────────────────────────
// Modal views follow the HIG (Modality, Accessibility): they name their task, always offer an obvious way
// out (close button, Escape, clicking the backdrop), keep keyboard focus inside while open, and return focus
// to whatever opened them.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function useDialog(open: boolean, onClose: () => void, panel: RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const node = panel.current
    // Focus the first field or control, else the panel itself.
    const first = node?.querySelector<HTMLElement>('input, textarea, select') ?? node?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? node)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const [head, tail] = [items[0], items[items.length - 1]]
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault()
        tail.focus()
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault()
        head.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open, panel])
}

/** HubSpot-style right side panel with navy header. */
export function Drawer({ open, title, onClose, children, footer, width = 480 }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  const panel = useRef<HTMLElement>(null)
  const titleId = useId()
  useDialog(open, onClose, panel)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-obsidian/40" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="animate-slide-in relative flex h-full max-w-full flex-col bg-surface shadow-2xl focus:outline-none"
        style={{ width }}
      >
        <header className="flex items-center justify-between bg-obsidian-2 px-6 py-4 text-white">
          <h2 id={titleId} className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
            <X size={18} />
          </button>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-6">{children}</div>
        {footer && <footer className="flex gap-2 border-t border-line-2 bg-canvas px-6 py-4">{footer}</footer>}
      </aside>
    </div>
  )
}

/** Luma-style centered modal: rounded, airy, soft shadow. `label` names the task for assistive technology. */
export function Modal({ open, onClose, children, label, width = 560 }: { open: boolean; onClose: () => void; children: ReactNode; label: string; width?: number }) {
  const panel = useRef<HTMLDivElement>(null)
  useDialog(open, onClose, panel)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh]">
      <div className="absolute inset-0 bg-obsidian/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="animate-pop-in relative w-full overflow-hidden rounded-2xl bg-surface shadow-2xl focus:outline-none"
        style={{ maxWidth: width }}
      >
        {children}
      </div>
    </div>
  )
}
