'use client'

import { useState, useEffect, useCallback } from 'react'

export function useSidebarCollapse(storageKey = 'super-admin-sidebar-collapsed') {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored === 'true') {
      setIsCollapsed(true)
    }
    setIsHydrated(true)
  }, [storageKey])

  const toggle = useCallback(() => {
    setIsCollapsed(prev => {
      const next = !prev
      localStorage.setItem(storageKey, String(next))
      return next
    })
  }, [storageKey])

  const toggleMobile = useCallback(() => setIsMobileOpen(prev => !prev), [])
  const closeMobile = useCallback(() => setIsMobileOpen(false), [])

  return { isCollapsed, toggle, isHydrated, isMobileOpen, toggleMobile, closeMobile }
}
