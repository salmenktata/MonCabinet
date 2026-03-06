'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import LanguageSwitcher from '@/components/ui/LanguageSwitcher'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

interface SuperAdminTopbarProps {
  user: {
    email: string
    nom?: string
    prenom?: string
  }
  pendingCount?: number
  onToggleMobileMenu?: () => void
}

export function SuperAdminTopbar({
  user,
  pendingCount = 0,
  onToggleMobileMenu,
}: SuperAdminTopbarProps) {
  const router = useRouter()
  const displayName = user.prenom && user.nom
    ? `${user.prenom} ${user.nom}`
    : user.email

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Erreur déconnexion:', error)
    }
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 sm:h-16 sm:px-6">
      {/* Titre de la section */}
      <div className="flex items-center gap-4">
        {/* Bouton burger – mobile uniquement */}
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Ouvrir le menu"
        >
          <Icons.menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">Administration</h1>
        {pendingCount > 0 && (
          <Badge variant="destructive" className="animate-pulse">
            {pendingCount} en attente
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Language Switcher */}
        <div className="hidden sm:block">
          <LanguageSwitcher />
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                <Icons.shield className="h-4 w-4 text-white" />
              </div>
              <span className="hidden max-w-[150px] truncate sm:inline">{displayName}</span>
              <Icons.chevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 max-w-[calc(100vw-2rem)]">
            <DropdownMenuLabel className="text-muted-foreground">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium text-foreground">{displayName}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
                <Badge variant="secondary" className="w-fit mt-1 bg-blue-600 text-white">
                  Super Admin
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/dashboard" className="flex items-center gap-2">
                <Icons.dashboard className="h-4 w-4" />
                Dashboard utilisateur
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/super-admin/settings" className="flex items-center gap-2">
                <Icons.settings className="h-4 w-4" />
                Paramètres admin
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-500 hover:text-red-600 cursor-pointer"
            >
              <Icons.logout className="h-4 w-4 mr-2" />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
