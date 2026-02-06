'use client'

import { memo, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

interface NavItem {
  href: string
  label: string
  icon: keyof typeof Icons
  badge?: number
}

interface NavGroup {
  group: string
  items: NavItem[]
}

interface SidebarProps {
  collapsed: boolean
  onCollapse: () => void
}

// Navigation statique - définie en dehors du composant
const navGroups: NavGroup[] = [
  {
    group: 'Core',
    items: [
      { href: '/dashboard', label: 'dashboard', icon: 'dashboard' },
      { href: '/clients', label: 'clients', icon: 'clients' },
      { href: '/dossiers', label: 'dossiers', icon: 'dossiers' },
      { href: '/echeances', label: 'deadlines', icon: 'deadlines' },
    ],
  },
  {
    group: 'Finance',
    items: [
      { href: '/factures', label: 'factures', icon: 'invoices' },
      { href: '/time-tracking', label: 'timeTracking', icon: 'timeTracking' },
    ],
  },
  {
    group: 'Documents',
    items: [
      { href: '/documents', label: 'documents', icon: 'documents' },
      { href: '/templates', label: 'templates', icon: 'templates' },
    ],
  },
  {
    group: 'Intelligence',
    items: [
      { href: '/assistant-ia', label: 'assistantIA', icon: 'zap' },
      { href: '/dossiers/assistant', label: 'modeRapide', icon: 'activity' },
      { href: '/parametres/base-connaissances', label: 'knowledgeBase', icon: 'bookOpen' },
    ],
  },
  {
    group: 'Système',
    items: [
      { href: '/parametres/cabinet', label: 'cabinet', icon: 'building' },
      { href: '/parametres/notifications', label: 'notifications', icon: 'bell' },
      { href: '/parametres/cloud-storage', label: 'cloudStorage', icon: 'cloud' },
      { href: '/parametres/messagerie', label: 'messaging', icon: 'messageSquare' },
    ],
  },
]

// Composant NavLink mémorisé
interface NavLinkProps {
  item: NavItem
  isActive: boolean
  collapsed: boolean
  label: string
}

const NavLink = memo(function NavLink({ item, isActive, collapsed, label }: NavLinkProps) {
  const Icon = Icons[item.icon]

  return (
    <Link href={item.href} prefetch={true}>
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          isActive && 'bg-accent text-accent-foreground border-l-4 border-primary',
          collapsed && 'justify-center'
        )}
        title={collapsed ? label : undefined}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!collapsed && <span>{label}</span>}
        {!collapsed && item.badge && (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {item.badge}
          </span>
        )}
      </div>
    </Link>
  )
})

function SidebarComponent({ collapsed, onCollapse }: SidebarProps) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const tGroups = useTranslations('navGroups')

  // Mémorise la vérification d'active state
  const isActive = useCallback((href: string) => {
    return pathname === href || pathname?.startsWith(href + '/')
  }, [pathname])

  // Mémorise les items avec leurs états
  const groupsWithState = useMemo(() => {
    return navGroups.map(group => ({
      ...group,
      items: group.items.map(item => ({
        ...item,
        isActive: isActive(item.href),
        translatedLabel: t(item.label),
      })),
      translatedGroup: tGroups(group.group.toLowerCase()),
    }))
  }, [isActive, t, tGroups])

  const settingsActive = useMemo(() => isActive('/settings'), [isActive])

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r bg-card transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b">
        {!collapsed && (
          <Link href="/dashboard" className="text-2xl font-bold text-primary" prefetch={true}>
            MonCabinet
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onCollapse}
          className={cn('transition-transform', collapsed && 'mx-auto')}
        >
          {collapsed ? (
            <Icons.chevronRight className="h-4 w-4" />
          ) : (
            <Icons.chevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 p-4 overflow-y-auto">
        {groupsWithState.map((group, groupIndex) => (
          <div key={group.group} className="space-y-1">
            {!collapsed && (
              <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {group.translatedGroup}
              </h3>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={item.isActive}
                collapsed={collapsed}
                label={item.translatedLabel}
              />
            ))}
            {!collapsed && groupIndex < groupsWithState.length - 1 && (
              <Separator className="my-4" />
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-4">
        <Link href="/settings" prefetch={true}>
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              settingsActive && 'bg-accent text-accent-foreground',
              collapsed && 'justify-center'
            )}
            title={collapsed ? t('settings') : undefined}
          >
            <Icons.settings className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{t('settings')}</span>}
          </div>
        </Link>
      </div>
    </aside>
  )
}

export const Sidebar = memo(SidebarComponent)
