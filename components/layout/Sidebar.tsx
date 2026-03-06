'use client'

import { memo, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Separator } from '@/components/ui/separator'
import { LogoHorizontal, LogoIcon } from '@/components/ui/Logo'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'

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
  onClose?: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
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
      { href: '/agenda', label: 'agenda', icon: 'calendar' },
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
      { href: '/qadhya-ia/ariida', label: 'qadhyaIAAriida', icon: 'fileText' },
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

interface NavLinkProps {
  item: NavItem
  isActive: boolean
  label: string
  onClick?: () => void
  isCollapsed?: boolean
  isHighlighted?: boolean
}

const NavLink = memo(function NavLink({ item, isActive, label, onClick, isCollapsed, isHighlighted }: NavLinkProps) {
  const Icon = Icons[item.icon]

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={item.href} prefetch={true} onClick={onClick}>
            <div className={cn(
              'relative flex items-center justify-center rounded-lg p-2 transition-colors',
              isHighlighted
                ? 'hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300'
                : 'hover:bg-accent hover:text-accent-foreground',
              isActive && 'bg-accent text-accent-foreground border-l-2 border-primary'
            )}>
              <Icon className="h-5 w-5 shrink-0" />
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    )
  }

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

function SidebarComponent({ userRole, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const tGroups = useTranslations('navGroups')

  const isActive = useCallback((href: string) => {
    return pathname === href || pathname?.startsWith(href + '/')
  }, [pathname])

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
  const abonnementActive = useMemo(() => isActive('/abonnement'), [isActive])

  const ToggleIcon = isCollapsed ? Icons.panelLeftOpen : Icons.panelLeftClose

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className={cn(
          'flex h-screen flex-col border-r bg-card transition-all duration-300 ease-in-out',
          isCollapsed ? 'w-16' : 'w-64'
        )}
        aria-label="Navigation principale"
      >
        {/* Logo */}
        <div className={cn(
          'flex h-16 items-center border-b',
          isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
        )}>
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/dashboard" prefetch={true} onClick={onClose}>
                  <LogoIcon size="sm" />
                </Link>
              </TooltipTrigger>
              {process.env.NEXT_PUBLIC_APP_VERSION && (
                <TooltipContent side="right">v{process.env.NEXT_PUBLIC_APP_VERSION}</TooltipContent>
              )}
            </Tooltip>
          ) : (
            <>
              <Link href="/dashboard" prefetch={true} onClick={onClose}>
                <LogoHorizontal size="sm" variant="juridique" showTag={true} animate={false} />
              </Link>
              {process.env.NEXT_PUBLIC_APP_VERSION && (
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground select-none" title="Version de build">
                  v{process.env.NEXT_PUBLIC_APP_VERSION}
                </span>
              )}
            </>
          )}
        </div>

        {/* Toggle button */}
        {onToggleCollapse && (
          <div className={cn('flex', isCollapsed ? 'justify-center py-2' : 'justify-end px-3 py-2')}>
            <button
              onClick={onToggleCollapse}
              className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              title={isCollapsed ? 'Étendre le menu' : 'Réduire le menu'}
            >
              <ToggleIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav
          className={cn('flex-1 overflow-y-auto', isCollapsed ? 'p-2 space-y-4' : 'p-4 space-y-6')}
          aria-label="Menu principal"
        >
          {groupsWithState.map((group, groupIndex) => {
            const isHighlighted = group.variant === 'highlighted'
            const GroupIcon = group.groupIcon ? Icons[group.groupIcon] : null

            if (isCollapsed) {
              return (
                <div key={group.group} className={cn('space-y-1', isHighlighted && 'border-l-2 border-indigo-400 dark:border-indigo-600 pl-0.5')}>
                  {group.items.map((item) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      isActive={item.isActive}
                      label={item.translatedLabel}
                      onClick={onClose}
                      isCollapsed={true}
                      isHighlighted={isHighlighted}
                    />
                  ))}
                  {groupIndex < groupsWithState.length - 1 && (
                    <Separator className="my-2" />
                  )}
                </div>
              )
            }

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
                    isCollapsed={false}
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
        <div className={cn('border-t', isCollapsed ? 'p-2 space-y-1' : 'p-4 space-y-1')}>
          {userRole === 'super_admin' && (
            <>
              {isCollapsed ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href="/super-admin/dashboard" prefetch={true} onClick={onClose}>
                        <div className="flex items-center justify-center rounded-lg p-2 transition-colors bg-blue-600 text-white hover:bg-blue-700">
                          <Icons.shield className="h-5 w-5 shrink-0" />
                        </div>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">Super Admin</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href="/super-admin/compare-llm" prefetch={true} onClick={onClose}>
                        <div className="flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-accent hover:text-accent-foreground">
                          <Icons.columns className="h-5 w-5 shrink-0" />
                        </div>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">Comparer LLMs</TooltipContent>
                  </Tooltip>
                </>
              ) : (
                <>
                  <Link href="/super-admin/dashboard" prefetch={true} onClick={onClose}>
                    <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700">
                      <Icons.shield className="h-5 w-5 shrink-0" />
                      <span>Super Admin</span>
                    </div>
                  </Link>
                  <Link href="/super-admin/compare-llm" prefetch={true} onClick={onClose}>
                    <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
                      <Icons.columns className="h-5 w-5 shrink-0" />
                      <span>Comparer LLMs</span>
                    </div>
                  </Link>
                </>
              )}
            </>
          )}

          {isCollapsed ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/abonnement" prefetch={true} onClick={onClose}>
                    <div className={cn(
                      'flex items-center justify-center rounded-lg p-2 transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      abonnementActive && 'bg-accent text-accent-foreground border-l-2 border-primary'
                    )}>
                      <Icons.creditCard className="h-5 w-5 shrink-0" />
                    </div>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{t('mySubscription')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/settings" prefetch={true} onClick={onClose}>
                    <div className={cn(
                      'flex items-center justify-center rounded-lg p-2 transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      settingsActive && 'bg-accent text-accent-foreground border-l-2 border-primary'
                    )}>
                      <Icons.settings className="h-5 w-5 shrink-0" />
                    </div>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{t('settings')}</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <>
              <Link href="/abonnement" prefetch={true} onClick={onClose}>
                <div className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  abonnementActive && 'bg-accent text-accent-foreground border-l-4 border-primary pl-[8px]'
                )}>
                  <Icons.creditCard className="h-5 w-5 shrink-0" />
                  <span>{t('mySubscription')}</span>
                </div>
              </Link>
              <Link href="/settings" prefetch={true} onClick={onClose}>
                <div className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  settingsActive && 'bg-accent text-accent-foreground border-l-4 border-primary pl-[8px]'
                )}>
                  <Icons.settings className="h-5 w-5 shrink-0" />
                  <span>{t('settings')}</span>
                </div>
              </Link>
            </>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}

export const Sidebar = memo(SidebarComponent)
