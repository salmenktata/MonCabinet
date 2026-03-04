'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import type { LegalStance } from '@/lib/ai/legal-reasoning-prompts'

const STORAGE_KEY = 'qadhya_stance'

interface StanceContextValue {
  stance: LegalStance
  setStance: (s: LegalStance) => void
}

export const StanceContext = createContext<StanceContextValue>({
  stance: 'neutral',
  setStance: () => {},
})

function readStoredStance(): LegalStance {
  if (typeof window === 'undefined') return 'neutral'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'defense' || stored === 'attack' || stored === 'neutral') {
    return stored
  }
  return 'neutral'
}

export function StanceProvider({ children }: { children: React.ReactNode }) {
  // Initialiser avec 'neutral' pour correspondre au rendu SSR, puis lire localStorage
  const [stance, setStanceState] = useState<LegalStance>('neutral')

  // Lire localStorage après hydration pour éviter le mismatch SSR/client
  useEffect(() => {
    setStanceState(readStoredStance())
  }, [])

  // Sync inter-onglets : écoute les changements localStorage depuis d'autres onglets
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const next = e.newValue as LegalStance
        if (next === 'defense' || next === 'attack' || next === 'neutral') {
          setStanceState(next)
        }
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const setStance = (s: LegalStance) => {
    setStanceState(s)
    localStorage.setItem(STORAGE_KEY, s)
  }

  return (
    <StanceContext.Provider value={{ stance, setStance }}>
      {children}
    </StanceContext.Provider>
  )
}

export function useStance() {
  return useContext(StanceContext)
}
