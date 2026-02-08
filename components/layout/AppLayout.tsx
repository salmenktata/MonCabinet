'use client'

import { memo, useState, useEffect, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
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
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Check initial
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const isMobile = useIsMobile()

  const closeMobile = useCallback(() => setMobileOpen(false), [])
  const openMobile = useCallback(() => setMobileOpen(true), [])

  return (
    <div className="relative flex min-h-screen">
      {/* Desktop Sidebar - Toujours étendu */}
      {!isMobile && (
        <Sidebar userRole={user.role} />
      )}

      {/* Mobile Menu Button */}
      {isMobile && (
        <Button
          variant="ghost"
          size="icon"
          className="fixed left-4 top-4 z-50 lg:hidden"
          onClick={openMobile}
          aria-label="Ouvrir le menu"
        >
          <Icons.menu className="h-6 w-6" />
        </Button>
      )}

      {/* Mobile Drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <Sidebar userRole={user.role} onClose={closeMobile} />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <Topbar user={user} />
        <main className={cn(
          'flex-1 overflow-y-auto',
          'px-4 py-6 sm:px-6 lg:px-8'
        )}>
          {children}
        </main>
      </div>
    </div>
  )
}

export const AppLayout = memo(AppLayoutComponent)
