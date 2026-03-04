'use client'

import { useEffect, useState } from 'react'

/**
 * Détecte si l'écran est en mode mobile avec debounce.
 * Retourne `null` pendant l'hydratation SSR, puis `true`/`false`.
 */
export function useIsMobile(breakpoint = 1024, delay = 150): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null)

  useEffect(() => {
    setIsMobile(window.innerWidth < breakpoint)

    let timeoutId: ReturnType<typeof setTimeout>

    const handleResize = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        setIsMobile(window.innerWidth < breakpoint)
      }, delay)
    }

    window.addEventListener('resize', handleResize, { passive: true })
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', handleResize)
    }
  }, [breakpoint, delay])

  return isMobile
}
