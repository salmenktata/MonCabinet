'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import type { LegalStance } from '@/lib/ai/legal-reasoning-prompts'

const STORAGE_KEY = 'qadhya_stance'

interface StanceContextValue {
  stance: LegalStance
  setStance: (s: LegalStance) => void
}

export const StanceContext = createContext<StanceContextValue>({
  stance: 'defense',
  setStance: () => {},
})

export function StanceProvider({ children }: { children: React.ReactNode }) {
  const [stance, setStanceState] = useState<LegalStance>('defense')

  // Initialisation depuis localStorage (client uniquement)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as LegalStance | null
    if (stored === 'defense' || stored === 'attack' || stored === 'neutral') {
      setStanceState(stored)
    }
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
