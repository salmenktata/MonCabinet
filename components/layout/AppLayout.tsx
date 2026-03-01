'use client'

import { memo, useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { MobileBottomNav } from './MobileBottomNav'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  children: React.ReactNode
  user: {
    email: string
    nom?: string
    prenom?: string
    role?: string
  }
}

// Hook personnalisé pour détecter mobile avec debounce
function useIsMobile(breakpoint = 1024, delay = 150) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null)

  useEffect(() => {
    setIsMobile(window.innerWidth < breakpoint)

    let timeoutId: NodeJS.Timeout

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

function AppLayoutComponent({ children, user }: AppLayoutProps) {
  const isMobile = useIsMobile()

  return (
    <div className="relative flex min-h-[100dvh]">
      {/* Desktop Sidebar - Toujours étendu */}
      {isMobile === false && (
        <Sidebar userRole={user.role} />
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
