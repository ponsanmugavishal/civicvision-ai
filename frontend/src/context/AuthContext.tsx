import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { env, isMockMode, supabaseConfigured } from '@/config/env'
import { getUser, hydrateDirectory, setDirectoryUsers } from '@/data/directory'
import { useLiveUpdates } from '@/lib/live'
import { supabase } from '@/lib/supabase'
import { bumpData } from '@/services/dataEvents'
import { ApiError } from '@/services/errors'
import { http, setTokenProvider } from '@/services/httpClient'
import type { Department, UserProfile, Zone } from '@/types'

/**
 * Authentication.
 *  • Demo mode (VITE_DATA_MODE=mock): a fictional persona is "signed in" by remembering its id in this browser.
 *  • API mode: Supabase Auth issues the session; the role and scope always come from the backend's /api/me,
 *    never from the client. A dev-only login (VITE_DEV_LOGIN + backend DEV_LOGIN_ENABLED) exists for local testing.
 */
const DEMO_SESSION_KEY = 'civicvision.demo-session'
const DEV_TOKEN_KEY = 'civicvision.dev-token'

interface AuthValue {
  mode: 'mock' | 'api'
  ready: boolean
  /** Error while starting up (e.g. backend unreachable) — the app still renders public pages. */
  bootError: string | null
  user: UserProfile | null
  signInDemo: (userId: string) => void
  signInPassword: (email: string, password: string) => Promise<UserProfile>
  signUp: (displayName: string, email: string, password: string) => Promise<{ user: UserProfile | null; needsConfirmation: boolean }>
  signInDev: (email: string) => Promise<UserProfile>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

function readDemoSession(): UserProfile | null {
  try {
    return getUser(localStorage.getItem(DEMO_SESSION_KEY)) ?? null
  } catch {
    return null
  }
}

let devToken: string | null = (() => {
  try {
    return sessionStorage.getItem(DEV_TOKEN_KEY)
  } catch {
    return null
  }
})()

setTokenProvider(async () => {
  if (devToken) return devToken
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
})

async function loadProfile(): Promise<UserProfile> {
  const me = await http<{ profile: UserProfile }>('/api/me')
  const profile = { ...me.profile, isDemo: false }
  let people: UserProfile[] = [profile]
  if (profile.role !== 'citizen') {
    people = [profile, ...(await http<UserProfile[]>('/api/directory/staff')).filter((p) => p.id !== profile.id)]
  }
  setDirectoryUsers(people)
  return profile
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => (isMockMode ? readDemoSession() : null))
  const [ready, setReady] = useState(isMockMode)
  const [bootError, setBootError] = useState<string | null>(null)

  // API mode start-up: directory from the backend, then restore any existing session.
  useEffect(() => {
    if (isMockMode) return
    let cancelled = false
    ;(async () => {
      try {
        const [departments, zones] = await Promise.all([http<Department[]>('/api/directory/departments'), http<Zone[]>('/api/directory/zones')])
        hydrateDirectory(departments, zones)
        const hasSession = devToken || (supabase && (await supabase.auth.getSession()).data.session)
        if (hasSession) {
          try {
            const p = await loadProfile()
            if (!cancelled) setUser(p)
          } catch (e) {
            if (e instanceof ApiError && e.status === 401) {
              devToken = null
              sessionStorage.removeItem(DEV_TOKEN_KEY)
              await supabase?.auth.signOut()
            } else throw e
          }
        }
      } catch (e) {
        if (!cancelled) setBootError(e instanceof Error ? e.message : 'Could not reach the server.')
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    const sub = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && !devToken) setUser(null)
    })
    return () => {
      cancelled = true
      sub?.data.subscription.unsubscribe()
    }
  }, [])

  const signInDemo = useCallback((userId: string) => {
    const u = getUser(userId)
    if (!u) return
    try {
      localStorage.setItem(DEMO_SESSION_KEY, u.id)
    } catch {
      // Session just won't survive a reload.
    }
    setUser(u)
  }, [])

  const signInPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase Auth is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message)
    devToken = null
    const p = await loadProfile()
    setUser(p)
    bumpData()
    return p
  }, [])

  const signUp = useCallback(async (displayName: string, email: string, password: string) => {
    if (!supabase) throw new Error('Supabase Auth is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
    // display_name is only used as the profile name; the database trigger always creates a citizen.
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName }, emailRedirectTo: `${window.location.origin}/login` } })
    if (error) throw new Error(error.message)
    if (!data.session) return { user: null, needsConfirmation: true }
    const p = await loadProfile()
    setUser(p)
    return { user: p, needsConfirmation: false }
  }, [])

  const signInDev = useCallback(async (email: string) => {
    const res = await http<{ accessToken: string }>('/api/dev/login', { method: 'POST', body: JSON.stringify({ email }) })
    devToken = res.accessToken
    try {
      sessionStorage.setItem(DEV_TOKEN_KEY, res.accessToken)
    } catch {
      // ignore
    }
    const p = await loadProfile()
    setUser(p)
    bumpData()
    return p
  }, [])

  const signOut = useCallback(async () => {
    if (isMockMode) {
      try {
        localStorage.removeItem(DEMO_SESSION_KEY)
      } catch {
        // ignore
      }
    } else {
      devToken = null
      try {
        sessionStorage.removeItem(DEV_TOKEN_KEY)
      } catch {
        // ignore
      }
      await supabase?.auth.signOut()
      setDirectoryUsers([])
    }
    setUser(null)
  }, [])

  useLiveUpdates(ready && !bootError ? (user?.id ?? null) : null)

  const value = useMemo<AuthValue>(
    () => ({ mode: env.dataMode, ready, bootError, user, signInDemo, signInPassword, signUp, signInDev, signOut }),
    [ready, bootError, user, signInDemo, signInPassword, signUp, signInDev, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** For pages rendered behind RequireRole — the user is guaranteed to exist. */
export function useCurrentUser(): UserProfile {
  const { user } = useAuth()
  if (!user) throw new Error('No signed-in user')
  return user
}

export function homePathFor(user: UserProfile): string {
  switch (user.role) {
    case 'citizen':
      return '/citizen'
    case 'staff':
      return '/staff'
    default:
      return '/supervisor'
  }
}

export const authConfigured = isMockMode || supabaseConfigured || env.devLogin
