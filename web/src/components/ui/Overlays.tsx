import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

// ─── Overlays ───────────────────────────────────────────────────────────────

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}

/** HubSpot-style right side panel with navy header. */
export function Drawer({ open, title, onClose, children, footer, width = 480 }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEscape(onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-obsidian/40" onClick={onClose} />
      <aside className="animate-slide-in relative flex h-full max-w-full flex-col bg-white shadow-2xl" style={{ width }}>
        <header className="flex items-center justify-between bg-obsidian-2 px-6 py-4 text-white">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-white/10">
            <X size={18} />
          </button>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-6">{children}</div>
        {footer && <footer className="flex gap-2 border-t border-line-2 bg-canvas px-6 py-4">{footer}</footer>}
      </aside>
    </div>
  )
}

/** Luma-style centered modal: rounded, airy, soft shadow. */
export function Modal({ open, onClose, children, width = 560 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  useEscape(onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh]">
      <div className="absolute inset-0 bg-obsidian/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-pop-in relative w-full overflow-hidden rounded-2xl bg-white shadow-2xl" style={{ maxWidth: width }}>
        {children}
      </div>
    </div>
  )
}
