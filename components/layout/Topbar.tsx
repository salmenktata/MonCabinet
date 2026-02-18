'use client'

import * as React from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
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
  onMenuClick?: () => void
  showMenuButton?: boolean
}

export function Topbar({ user, onMenuClick, showMenuButton = false }: TopbarProps) {
  const t = useTranslations('common')

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
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        {/* Bouton menu mobile */}
        {showMenuButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="mr-2 lg:hidden shrink-0"
            aria-label="Ouvrir le menu"
          >
            <Icons.menu className="h-5 w-5" />
          </Button>
        )}

        {/* Breadcrumb à gauche */}
        <div className="flex-1 min-w-0">
          <Breadcrumbs />
        </div>

        {/* Actions à droite */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Recherche globale CMD+K */}
          <GlobalSearch className="hidden md:flex md:w-64" />

          {/* Language Switcher */}
          <div className="hidden sm:flex">
            <LanguageSwitcher />
          </div>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Notifications - TODO: implémenter */}
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Icons.bell className="h-5 w-5" />
          </Button>

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
              <DropdownMenuItem asChild>
                <form action="/api/auth/signout" method="post" className="w-full">
                  <button type="submit" className="flex w-full items-center">
                    <Icons.logout className="mr-2 h-4 w-4" />
                    <span>{t('logout')}</span>
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
