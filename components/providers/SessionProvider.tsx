'use client'

/**
 * SessionProvider - Contexte de session
 *
 * Fournit le contexte d'authentification aux composants enfants.
 * Utilise notre système d'authentification HttpOnly custom.
 *
 * Optimisation: Cache localStorage avec stale-while-revalidate
 * pour éviter le fetch bloquant à chaque page load.
 */

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

interface SessionUser {
  id: string
  email: string
  name: string
  role?: string
}

interface SessionContextType {
  user: SessionUser | null
  loading: boolean
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionContextType>({
  user: null,
  loading: true,
  refresh: async () => {},
})

export function useSession() {
  return useContext(SessionContext)
}

interface SessionProviderProps {
  children: ReactNode
}

// Clés et durée du cache
const CACHE_KEY = 'session_cache'
const CACHE_TIMESTAMP_KEY = 'session_cache_ts'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CachedSession {
  user: SessionUser | null
  timestamp: number
}

function getCachedSession(): CachedSession | null {
  if (typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem(CACHE_KEY)
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY)

    if (cached && timestamp) {
      return {
        user: JSON.parse(cached),
        timestamp: parseInt(timestamp, 10)
      }
    }
  } catch {
    // Erreur de parsing, ignorer le cache
  }
  return null
}

function setCachedSession(user: SessionUser | null): void {
  if (typeof window === 'undefined') return

  try {
    if (user) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(user))
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString())
    } else {
      localStorage.removeItem(CACHE_KEY)
      localStorage.removeItem(CACHE_TIMESTAMP_KEY)
    }
  } catch {
    // localStorage non disponible ou plein, ignorer
  }
}

function isCacheStale(timestamp: number): boolean {
  return Date.now() - timestamp > CACHE_TTL_MS
}

export function SessionProvider({ children }: SessionProviderProps) {
  // Éviter l'accès localStorage synchrone au render initial (cause forced reflow)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()

      if (data.authenticated && data.user) {
        setUser(data.user)
        setCachedSession(data.user)
      } else {
        setUser(null)
        setCachedSession(null)
      }
    } catch {
      setUser(null)
      setCachedSession(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Chargement asynchrone du cache pour éviter forced reflow
    const loadSession = async () => {
      // Lire le cache après le premier paint
      await new Promise(resolve => requestAnimationFrame(resolve))

      const cached = getCachedSession()

      if (cached && !isCacheStale(cached.timestamp)) {
        // Cache valide: afficher immédiatement, revalider en background
        setUser(cached.user)
        setLoading(false)
        // Stale-while-revalidate: mise à jour silencieuse en arrière-plan
        fetchSession()
      } else {
        // Pas de cache ou cache périmé: fetch bloquant
        fetchSession()
      }
    }

    loadSession()
  }, [fetchSession])

  return (
    <SessionContext.Provider value={{ user, loading, refresh: fetchSession }}>
      {children}
    </SessionContext.Provider>
  )
}
