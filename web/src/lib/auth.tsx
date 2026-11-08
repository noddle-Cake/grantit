import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

// Demo authentication. Not a security boundary: the app runs entirely in the browser on demo data,
// so this is a product gate (a sign-in screen in front of the workspace), not real auth. The one
// accepted credential is username "username" / password "password".
const DEMO_USERNAME = 'username'
const DEMO_PASSWORD = 'password'
const STORAGE_KEY = 'grantit:auth:v1'

interface Auth {
  signedIn: boolean
  /** Returns true on success, false on bad credentials. */
  signIn: (username: string, password: string) => boolean
  signOut: () => void
}

const AuthContext = createContext<Auth | null>(null)

function readSignedIn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(readSignedIn)

  const signIn = useCallback((username: string, password: string) => {
    const ok = username.trim().toLowerCase() === DEMO_USERNAME && password === DEMO_PASSWORD
    if (ok) {
      setSignedIn(true)
      try {
        localStorage.setItem(STORAGE_KEY, 'true')
      } catch {
        /* storage blocked — session stays in memory */
      }
    }
    return ok
  }, [])

  const signOut = useCallback(() => {
    setSignedIn(false)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  return <AuthContext.Provider value={{ signedIn, signIn, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext)
  // Fall back to a no-op when rendered outside a provider (e.g. component tests that mount AppShell
  // directly). Auth here is a product gate, not a security boundary, so this is safe.
  return ctx ?? { signedIn: readSignedIn(), signIn: () => false, signOut: () => {} }
}
