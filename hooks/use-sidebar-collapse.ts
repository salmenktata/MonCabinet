'use client'

import { useState, useCallback } from 'react'

export function useSidebarCollapse(storageKey = 'super-admin-sidebar-collapsed', initialValue?: boolean) {
  const [isCollapsed, setIsCollapsed] = useState(() => initialValue ?? false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  const toggle = useCallback(() => {
    setIsCollapsed(prev => {
      const next = !prev
      // Persister en DB (fire-and-forget)
      fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [storageKey]: next }),
      }).catch(() => {})
      return next
    })
  }, [storageKey])

  const toggleMobile = useCallback(() => setIsMobileOpen(prev => !prev), [])
  const closeMobile = useCallback(() => setIsMobileOpen(false), [])

  return { isCollapsed, toggle, isMobileOpen, toggleMobile, closeMobile }
}
