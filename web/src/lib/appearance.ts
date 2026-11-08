// Light/dark appearance. "system" follows prefers-color-scheme; "light" and "dark" override it. The choice is
// kept in this browser's localStorage only, outside the app state, so "Reset demo data" leaves it alone.
// The resolved value lands on <html data-theme="light|dark">, which index.css keys the dark tokens on.
// index.html applies the stored choice before first paint with an inline copy of resolveAppearance(); keep the
// two in step if the key or the rule changes.

export const APPEARANCE_KEY = 'grantit:appearance:v1'
export type Appearance = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function readAppearance(): Appearance {
  try {
    const v = localStorage.getItem(APPEARANCE_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function resolveAppearance(a: Appearance): Theme {
  if (a !== 'system') return a
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

export function applyAppearance(a: Appearance = readAppearance()): Theme {
  const theme = resolveAppearance(a)
  document.documentElement.dataset.theme = theme
  return theme
}

/** Saves the choice ("system" clears it) and applies it immediately. */
export function writeAppearance(a: Appearance) {
  try {
    if (a === 'system') localStorage.removeItem(APPEARANCE_KEY)
    else localStorage.setItem(APPEARANCE_KEY, a)
  } catch {
    // Storage blocked (private mode, policy): the choice still applies for this page view.
  }
  applyAppearance(a)
}

/** Keeps the page in step with the OS appearance (while on "system") and with changes made in other tabs. */
export function watchAppearance(): () => void {
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : undefined
  const onSystem = () => {
    if (readAppearance() === 'system') applyAppearance('system')
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === APPEARANCE_KEY || e.key === null) applyAppearance()
  }
  mq?.addEventListener('change', onSystem)
  window.addEventListener('storage', onStorage)
  return () => {
    mq?.removeEventListener('change', onSystem)
    window.removeEventListener('storage', onStorage)
  }
}
