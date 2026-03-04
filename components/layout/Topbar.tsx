'use client'

import * as React from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ThemeToggle } from './ThemeToggle'
import LanguageSwitcher from '@/components/ui/LanguageSwitcher'
import Breadcrumbs from '@/components/ui/Breadcrumbs'

// Ouvrir GlobalSearch via l'événement clavier (CMD+K) qu'il écoute déjà
function openGlobalSearch() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
  )
}

function useUrgentNotificationsCount() {
  const [count, setCount] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false

    async function fetchCount() {
      try {
        const res = await fetch('/api/user/notifications/count')
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled) setCount(data.urgent ?? 0)
      } catch { /* silencieux */ }
    }

    fetchCount()
    const interval = setInterval(fetchCount, 5 * 60 * 1000) // toutes les 5 min
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return count
}

// Lazy load GlobalSearch (522 lignes) après le premier render
const GlobalSearch = dynamic(
  () => import('./GlobalSearch').then(mod => ({ default: mod.GlobalSearch })),
  {
    loading: () => (
      <div className="hidden md:flex md:w-64 h-9 bg-muted animate-pulse rounded-md" />
    ),
    ssr: false
  }
)

interface TopbarProps {
  user: {
    email: string
    nom?: string
    prenom?: string
  }
}

export function Topbar({ user }: TopbarProps) {
  const t = useTranslations('common')
  const router = useRouter()
  const urgentCount = useUrgentNotificationsCount()

  const handleLogout = async () => {
    await fetch('/api/auth/signout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  // Générer les initiales pour l'avatar
  const initials = React.useMemo(() => {
    if (user.nom && user.prenom) {
      return `${user.prenom[0]}${user.nom[0]}`.toUpperCase()
    }
    if (user.email) {
      return user.email.substring(0, 2).toUpperCase()
    }
    return 'U'
  }, [user])

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-12 lg:h-16 items-center justify-between px-4 sm:px-6">
        {/* Breadcrumb à gauche */}
        <div className="flex-1 min-w-0">
          <Breadcrumbs />
        </div>

        {/* Actions à droite */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Recherche globale CMD+K — desktop */}
          <GlobalSearch className="hidden md:flex md:w-64" />

          {/* Bouton recherche — mobile uniquement */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={openGlobalSearch}
            aria-label="Rechercher"
          >
            <Icons.search className="h-5 w-5" />
          </Button>

          {/* Language Switcher */}
          <div className="hidden sm:flex">
            <LanguageSwitcher />
          </div>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Notifications - caché sur mobile (bottom nav) */}
          <Link href="/echeances" className="hidden lg:flex">
            <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${urgentCount > 0 ? ` (${urgentCount} urgentes)` : ''}`}>
              <Icons.bell className="h-5 w-5" />
              {urgentCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
                  {urgentCount > 9 ? '9+' : urgentCount}
                </span>
              )}
            </Button>
          </Link>

          {/* Menu utilisateur */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar>
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <div className="flex items-center justify-start gap-2 p-2">
                <div className="flex flex-col space-y-1 leading-none">
                  {user.nom && user.prenom && (
                    <p className="font-medium">
                      {user.prenom} {user.nom}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <div className="sm:hidden px-2 py-1.5">
                <LanguageSwitcher />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Icons.settings className="mr-2 h-4 w-4" />
                  <span>{t('settings')}</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <Icons.user className="mr-2 h-4 w-4" />
                  <span>{t('profile')}</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                <Icons.logout className="mr-2 h-4 w-4" />
                <span>{t('logout')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
