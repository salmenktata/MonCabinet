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
  unreadNotifications?: number
}

export function SuperAdminTopbar({
  user,
  pendingCount = 0,
  unreadNotifications = 0
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
    <header className="flex h-16 items-center justify-between border-b border-slate-700 bg-slate-900 px-6">
      {/* Titre de la section */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-white">Administration</h1>
        {pendingCount > 0 && (
          <Badge variant="destructive" className="animate-pulse">
            {pendingCount} en attente
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Notifications */}
        <Link href="/super-admin/notifications">
          <Button
            variant="ghost"
            size="icon"
            className="relative text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <Icons.bell className="h-5 w-5" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-xs text-white flex items-center justify-center">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </Button>
        </Link>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                <Icons.shield className="h-4 w-4 text-white" />
              </div>
              <span className="max-w-[150px] truncate">{displayName}</span>
              <Icons.chevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-slate-800 border-slate-700 text-slate-200">
            <DropdownMenuLabel className="text-slate-400">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium text-white">{displayName}</p>
                <p className="text-xs text-slate-400">{user.email}</p>
                <Badge variant="secondary" className="w-fit mt-1 bg-blue-600 text-white">
                  Super Admin
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem asChild className="hover:bg-slate-700 cursor-pointer">
              <Link href="/dashboard" className="flex items-center gap-2">
                <Icons.dashboard className="h-4 w-4" />
                Dashboard utilisateur
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="hover:bg-slate-700 cursor-pointer">
              <Link href="/super-admin/settings" className="flex items-center gap-2">
                <Icons.settings className="h-4 w-4" />
                Paramètres admin
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-400 hover:text-red-300 hover:bg-slate-700 cursor-pointer"
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
