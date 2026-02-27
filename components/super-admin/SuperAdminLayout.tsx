'use client'

import { Suspense } from 'react'
import { SuperAdminSidebar } from './SuperAdminSidebar'
import { SuperAdminTopbar } from './SuperAdminTopbar'
import { useSidebarCollapse } from '@/hooks/use-sidebar-collapse'
import { cn } from '@/lib/utils'

interface SuperAdminLayoutProps {
  children: React.ReactNode
  user: {
    email: string
    nom?: string
    prenom?: string
  }
  pendingCount?: number
  pendingTaxonomySuggestions?: number
}

export function SuperAdminLayout({
  children,
  user,
  pendingCount = 0,
  pendingTaxonomySuggestions = 0
}: SuperAdminLayoutProps) {
  const { isCollapsed, toggle, isMobileOpen, toggleMobile, closeMobile } = useSidebarCollapse()

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Backdrop mobile */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <Suspense fallback={null}>
        <SuperAdminSidebar
          pendingCount={pendingCount}
          pendingTaxonomySuggestions={pendingTaxonomySuggestions}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggle}
          isMobileOpen={isMobileOpen}
          onCloseMobile={closeMobile}
        />
      </Suspense>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden transition-all duration-300">
        {/* Topbar */}
        <SuperAdminTopbar
          user={user}
          pendingCount={pendingCount}
          onToggleMobileMenu={toggleMobile}
        />

        {/* Page content */}
        <main className={cn(
          'flex-1 overflow-y-auto bg-slate-950 p-6',
          'text-slate-100'
        )}>
          {children}
        </main>
      </div>
    </div>
  )
}
