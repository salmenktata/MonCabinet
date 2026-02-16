'use client'

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
  const { isCollapsed, toggle } = useSidebarCollapse()

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar */}
      <SuperAdminSidebar
        pendingCount={pendingCount}
        pendingTaxonomySuggestions={pendingTaxonomySuggestions}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggle}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden transition-all duration-300">
        {/* Topbar */}
        <SuperAdminTopbar
          user={user}
          pendingCount={pendingCount}
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
