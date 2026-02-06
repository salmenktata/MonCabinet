'use client'

import { memo, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { LogoHorizontal, LogoIcon } from '@/components/ui/Logo'

interface NavItem {
  href: string
  label: string
  icon: keyof typeof Icons
  badge?: number
  badgeVariant?: 'default' | 'destructive' | 'secondary'
}

interface NavGroup {
  group: string
  items: NavItem[]
}

interface SuperAdminSidebarProps {
  collapsed: boolean
  onCollapse: () => void
  pendingCount?: number
  unreadNotifications?: number
}

// Navigation Super Admin
const getNavGroups = (pendingCount: number, unreadNotifications: number): NavGroup[] => [
  {
    group: 'Vue d\'ensemble',
    items: [
      { href: '/super-admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
      {
        href: '/super-admin/notifications',
        label: 'Notifications',
        icon: 'bell',
        badge: unreadNotifications || undefined,
        badgeVariant: 'destructive' as const
      },
    ],
  },
  {
    group: 'Gestion',
    items: [
      {
        href: '/super-admin/users',
        label: 'Utilisateurs',
        icon: 'users',
        badge: pendingCount || undefined,
        badgeVariant: 'destructive' as const
      },
      { href: '/super-admin/plans', label: 'Plans & Abonnements', icon: 'creditCard' },
    ],
  },
  {
    group: 'Contenu',
    items: [
      { href: '/super-admin/knowledge-base', label: 'Base de connaissances', icon: 'bookOpen' },
    ],
  },
  {
    group: 'Monitoring',
    items: [
      { href: '/super-admin/ai-costs', label: 'Coûts IA', icon: 'dollar' },
      { href: '/super-admin/audit-logs', label: 'Audit Logs', icon: 'shield' },
      { href: '/super-admin/backups', label: 'Backups', icon: 'database' },
    ],
  },
  {
    group: 'Configuration',
    items: [
      { href: '/super-admin/settings', label: 'Paramètres', icon: 'settings' },
    ],
  },
]

// Composant NavLink mémorisé
interface NavLinkProps {
  item: NavItem
  isActive: boolean
  collapsed: boolean
}

const NavLink = memo(function NavLink({ item, isActive, collapsed }: NavLinkProps) {
  const Icon = Icons[item.icon]

  return (
    <Link href={item.href} prefetch={true}>
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-slate-800 hover:text-white',
          isActive && 'bg-slate-800 text-white border-l-4 border-blue-500',
          collapsed && 'justify-center'
        )}
        title={collapsed ? item.label : undefined}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
        {!collapsed && item.badge && (
          <Badge
            variant={item.badgeVariant || 'default'}
            className="ml-auto"
          >
            {item.badge}
          </Badge>
        )}
      </div>
    </Link>
  )
})

function SuperAdminSidebarComponent({
  collapsed,
  onCollapse,
  pendingCount = 0,
  unreadNotifications = 0
}: SuperAdminSidebarProps) {
  const pathname = usePathname()

  // Mémorise la vérification d'active state
  const isActive = useCallback((href: string) => {
    return pathname === href || pathname?.startsWith(href + '/')
  }, [pathname])

  // Mémorise les items avec leurs états
  const navGroups = useMemo(() => getNavGroups(pendingCount, unreadNotifications), [pendingCount, unreadNotifications])

  const groupsWithState = useMemo(() => {
    return navGroups.map(group => ({
      ...group,
      items: group.items.map(item => ({
        ...item,
        isActive: isActive(item.href),
      })),
    }))
  }, [isActive, navGroups])

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-slate-700 bg-slate-900 text-slate-300 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-slate-700">
        {!collapsed ? (
          <Link href="/super-admin/dashboard" prefetch={true}>
            <LogoHorizontal size="sm" variant="juridique" showTag={true} animate={false} />
          </Link>
        ) : (
          <Link href="/super-admin/dashboard" prefetch={true} className="mx-auto">
            <LogoIcon size="sm" animate={false} />
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onCollapse}
          className={cn(
            'transition-transform text-slate-400 hover:text-white hover:bg-slate-800',
            collapsed ? 'hidden' : ''
          )}
        >
          <Icons.chevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 p-4 overflow-y-auto">
        {groupsWithState.map((group, groupIndex) => (
          <div key={group.group} className="space-y-1">
            {!collapsed && (
              <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {group.group}
              </h3>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={item.isActive}
                collapsed={collapsed}
              />
            ))}
            {!collapsed && groupIndex < groupsWithState.length - 1 && (
              <Separator className="my-4 bg-slate-700" />
            )}
          </div>
        ))}
      </nav>

      {/* Footer - Retour au dashboard utilisateur */}
      <div className="border-t border-slate-700 p-4">
        <Link href="/dashboard" prefetch={true}>
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'text-slate-400 hover:bg-slate-800 hover:text-white',
              collapsed && 'justify-center'
            )}
            title={collapsed ? 'Retour au Dashboard' : undefined}
          >
            <Icons.arrowLeft className="h-5 w-5 shrink-0" />
            {!collapsed && <span>Retour au Dashboard</span>}
          </div>
        </Link>
      </div>
    </aside>
  )
}

export const SuperAdminSidebar = memo(SuperAdminSidebarComponent)
