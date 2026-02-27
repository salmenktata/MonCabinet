'use client'

import { memo, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Separator } from '@/components/ui/separator'
import { LogoHorizontal } from '@/components/ui/Logo'

interface NavItem {
  href: string
  label: string
  icon: keyof typeof Icons
  badge?: number
}

interface NavGroup {
  group: string
  items: NavItem[]
  variant?: 'default' | 'highlighted'
  groupIcon?: keyof typeof Icons
}

interface SidebarProps {
  userRole?: string
  onClose?: () => void // Pour fermer le drawer mobile
}

// Navigation dynamique selon le rôle utilisateur
const getNavGroups = (userRole?: string): NavGroup[] => [
  {
    group: 'Core',
    items: [
      { href: '/dashboard', label: 'dashboard', icon: 'dashboard' },
      { href: '/clients', label: 'clients', icon: 'clients' },
      { href: '/dossiers', label: 'dossiers', icon: 'dossiers' },
      { href: '/echeances', label: 'deadlines', icon: 'deadlines' },
      { href: '/recherche', label: 'globalSearch', icon: 'search' },
    ],
  },
  {
    group: 'Intelligence',
    variant: 'highlighted',
    groupIcon: 'sparkles',
    items: [
      { href: '/qadhya-ia/structure', label: 'qadhyaIAStructure', icon: 'edit' },
      { href: '/qadhya-ia/chat', label: 'qadhyaIAChat', icon: 'messageSquare' },
      { href: '/client/knowledge-base', label: 'knowledgeBaseExplorer', icon: 'bookOpen' },
    ],
  },
  {
    group: 'Finance',
    items: [
      { href: '/factures', label: 'factures', icon: 'invoices' },
      { href: '/time-tracking', label: 'timeTracking', icon: 'timeTracking' },
      { href: '/recap-semaine', label: 'weeklyRecap', icon: 'calendar' },
    ],
  },
  {
    group: 'Documents',
    items: [
      { href: '/documents', label: 'documents', icon: 'documents' },
      { href: '/templates', label: 'templates', icon: 'templates' },
    ],
  },
]

// Composant NavLink mémorisé
interface NavLinkProps {
  item: NavItem
  isActive: boolean
  label: string
  onClick?: () => void
}

const NavLink = memo(function NavLink({ item, isActive, label, onClick }: NavLinkProps) {
  const Icon = Icons[item.icon]

  return (
    <Link href={item.href} prefetch={true} onClick={onClick}>
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          isActive && 'bg-accent text-accent-foreground border-l-4 border-primary pl-[8px]'
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span>{label}</span>
        {item.badge && (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {item.badge}
          </span>
        )}
      </div>
    </Link>
  )
})

function SidebarComponent({ userRole, onClose }: SidebarProps) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const tGroups = useTranslations('navGroups')

  // Mémorise la vérification d'active state
  const isActive = useCallback((href: string) => {
    return pathname === href || pathname?.startsWith(href + '/')
  }, [pathname])

  // Mémorise les items avec leurs états
  const groupsWithState = useMemo(() => {
    const navGroups = getNavGroups(userRole)
    return navGroups
      .filter(group => group && group.group && group.items?.length > 0)
      .map(group => ({
        ...group,
        variant: group.variant ?? 'default',
        groupIcon: group.groupIcon,
        items: group.items.map(item => ({
          ...item,
          isActive: isActive(item.href),
          translatedLabel: t(item.label),
        })),
        translatedGroup: tGroups(group.group.toLowerCase()),
      }))
  }, [isActive, t, tGroups, userRole])

  const settingsActive = useMemo(() => isActive('/settings'), [isActive])
  const abonnementActive = useMemo(() => isActive('/dashboard/abonnement'), [isActive])

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card" aria-label="Navigation principale">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b">
        <Link href="/dashboard" prefetch={true} onClick={onClose}>
          <LogoHorizontal size="sm" variant="juridique" showTag={true} animate={false} />
        </Link>
        {process.env.NEXT_PUBLIC_APP_VERSION && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground select-none" title="Version de build">
            v{process.env.NEXT_PUBLIC_APP_VERSION}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 p-4 overflow-y-auto" aria-label="Menu principal">
        {groupsWithState.map((group, groupIndex) => {
          const isHighlighted = group.variant === 'highlighted'
          const GroupIcon = group.groupIcon ? Icons[group.groupIcon] : null

          const groupContent = (
            <>
              <h3 className={cn(
                'px-3 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5',
                isHighlighted ? 'text-indigo-700 dark:text-indigo-300' : 'text-muted-foreground'
              )}>
                {GroupIcon && <GroupIcon className="h-3.5 w-3.5" />}
                {group.translatedGroup}
              </h3>
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  isActive={item.isActive}
                  label={item.translatedLabel}
                  onClick={onClose}
                />
              ))}
            </>
          )

          return (
            <div key={group.group}>
              {isHighlighted ? (
                <div className="relative rounded-lg border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/30 p-2 space-y-1">
                  <div className="absolute inset-y-1 left-0 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500" />
                  {groupContent}
                </div>
              ) : (
                <div className="space-y-1">
                  {groupContent}
                </div>
              )}
              {groupIndex < groupsWithState.length - 1 && (
                <Separator className="my-4" />
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-4 space-y-1">
        {/* Lien Super Admin pour les super_admin */}
        {userRole === 'super_admin' && (
          <Link href="/super-admin/dashboard" prefetch={true} onClick={onClose}>
            <div
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700"
            >
              <Icons.shield className="h-5 w-5 shrink-0" />
              <span>Super Admin</span>
            </div>
          </Link>
        )}

        <Link href="/dashboard/abonnement" prefetch={true} onClick={onClose}>
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              abonnementActive && 'bg-accent text-accent-foreground border-l-4 border-primary pl-[8px]'
            )}
          >
            <Icons.creditCard className="h-5 w-5 shrink-0" />
            <span>{t('mySubscription')}</span>
          </div>
        </Link>

        <Link href="/settings" prefetch={true} onClick={onClose}>
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              settingsActive && 'bg-accent text-accent-foreground border-l-4 border-primary pl-[8px]'
            )}
          >
            <Icons.settings className="h-5 w-5 shrink-0" />
            <span>{t('settings')}</span>
          </div>
        </Link>
      </div>
    </aside>
  )
}

export const Sidebar = memo(SidebarComponent)
