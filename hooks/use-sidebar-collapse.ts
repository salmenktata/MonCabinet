'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'super-admin-sidebar-collapsed'

export function useSidebarCollapse() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'true') {
      setIsCollapsed(true)
    }
    setIsHydrated(true)
  }, [])

  const toggle = useCallback(() => {
    setIsCollapsed(prev => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  const toggleMobile = useCallback(() => setIsMobileOpen(prev => !prev), [])
  const closeMobile = useCallback(() => setIsMobileOpen(false), [])

  return { isCollapsed, toggle, isHydrated, isMobileOpen, toggleMobile, closeMobile }
}
