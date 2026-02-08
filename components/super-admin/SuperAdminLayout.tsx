'use client'

import { SuperAdminSidebar } from './SuperAdminSidebar'
import { SuperAdminTopbar } from './SuperAdminTopbar'
import { cn } from '@/lib/utils'

interface SuperAdminLayoutProps {
  children: React.ReactNode
  user: {
    email: string
    nom?: string
    prenom?: string
  }
  pendingCount?: number
  unreadNotifications?: number
  pendingTaxonomySuggestions?: number
}

export function SuperAdminLayout({
  children,
  user,
  pendingCount = 0,
  unreadNotifications = 0,
  pendingTaxonomySuggestions = 0
}: SuperAdminLayoutProps) {
  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar - toujours étendu */}
      <SuperAdminSidebar
        pendingCount={pendingCount}
        unreadNotifications={unreadNotifications}
        pendingTaxonomySuggestions={pendingTaxonomySuggestions}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <SuperAdminTopbar
          user={user}
          pendingCount={pendingCount}
          unreadNotifications={unreadNotifications}
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
