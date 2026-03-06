'use client'

import { memo } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { MobileBottomNav } from './MobileBottomNav'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSidebarCollapse } from '@/hooks/use-sidebar-collapse'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  children: React.ReactNode
  user: {
    email: string
    nom?: string
    prenom?: string
    role?: string
  }
  initialSidebarCollapsed?: boolean
}

function AppLayoutComponent({ children, user, initialSidebarCollapsed }: AppLayoutProps) {
  const isMobile = useIsMobile()
  const { isCollapsed, toggle } = useSidebarCollapse('dashboard-sidebar-collapsed', initialSidebarCollapsed)

  return (
    <div className="relative flex min-h-[100dvh]">
      {/* Desktop Sidebar */}
      {isMobile === false && (
        <Sidebar userRole={user.role} isCollapsed={isCollapsed} onToggleCollapse={toggle} />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <Topbar user={user} />
        <main className={cn(
          'flex-1 overflow-y-auto',
          'px-4 py-6 sm:px-6 lg:px-8',
          // Espace pour la bottom nav mobile (h-16 + safe-area iOS)
          'pb-safe-bottom-nav lg:pb-6'
        )}>
          {children}
        </main>
      </div>

      {/* Bottom Navigation mobile uniquement */}
      {isMobile === true && (
        <MobileBottomNav userRole={user.role} />
      )}
    </div>
  )
}

export const AppLayout = memo(AppLayoutComponent)
