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
    role?: string
  }
  pendingCount?: number
  pendingTaxonomySuggestions?: number
  initialSidebarCollapsed?: boolean
}

export function SuperAdminLayout({
  children,
  user,
  pendingCount = 0,
  pendingTaxonomySuggestions = 0,
  initialSidebarCollapsed,
}: SuperAdminLayoutProps) {
  const { isCollapsed, toggle, isMobileOpen, toggleMobile, closeMobile } = useSidebarCollapse('super-admin-sidebar-collapsed', initialSidebarCollapsed)

  return (
    <div className="flex h-screen bg-background">
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
          userRole={user.role}
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
          'flex-1 overflow-y-auto bg-background p-4 sm:p-6',
          'text-foreground'
        )}>
          {children}
        </main>
      </div>
    </div>
  )
}
