'use client'

import { memo, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { LogoHorizontal, LogoIcon } from '@/components/ui/Logo'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip'

interface NavItem {
  href: string
  label: string
  icon: keyof typeof Icons
  badge?: number
  badgeVariant?: 'default' | 'destructive' | 'secondary'
  superAdminOnly?: boolean
}

interface NavGroup {
  group: string
  items: NavItem[]
}

interface SuperAdminSidebarProps {
  pendingCount?: number
  pendingContradictions?: number
  pendingTaxonomySuggestions?: number
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  isMobileOpen?: boolean
  onCloseMobile?: () => void
  userRole?: string
}

// Navigation Super Admin - 5 groupes, 23 items (26 initial - 3 doublons/docs)
const getNavGroups = (
  pendingCount: number,
  pendingContradictions: number,
  pendingTaxonomySuggestions: number
): NavGroup[] => [
  {
    group: 'Pilotage',
    items: [
      { href: '/super-admin/dashboard', label: 'Tableau de bord', icon: 'dashboard' },
      { href: '/super-admin/monitoring', label: 'Monitoring', icon: 'activity' },
      { href: '/super-admin/analytics', label: 'Analytics Clients', icon: 'chartBar' },
      { href: '/super-admin/server-status', label: 'Statut Serveur', icon: 'server' },
      { href: '/super-admin/quotas', label: 'Quotas & Limites', icon: 'chartBar' },
    ],
  },
  {
    group: 'Gestion Métier',
    items: [
      {
        href: '/super-admin/users',
        label: 'Utilisateurs',
        icon: 'users',
        badge: pendingCount || undefined,
        badgeVariant: 'destructive' as const,
      },
      { href: '/super-admin/plans', label: 'Plans & Abonnements', icon: 'creditCard' },
      { href: '/super-admin/promos', label: 'Codes Promo', icon: 'tag' },
      { href: '/super-admin/waitlist', label: 'Waitlist', icon: 'mail' },
      {
        href: '/super-admin/taxonomy',
        label: 'Taxonomie',
        icon: 'folder',
        badge: pendingTaxonomySuggestions || undefined,
        badgeVariant: 'secondary' as const,
      },
      { href: '/super-admin/settings', label: 'Configuration', icon: 'settings' },
    ],
  },
  {
    group: 'Contenu & Données',
    items: [
      { href: '/super-admin/knowledge-base', label: 'Base de Connaissances', icon: 'bookOpen' },
      { href: '/super-admin/knowledge-base/chunks-health', label: 'Chunks & Embeddings', icon: 'activity' },
      { href: '/super-admin/pipeline', label: 'Pipeline', icon: 'merge' },
      { href: '/super-admin/web-sources', label: 'Sources Web', icon: 'globe' },
      { href: '/super-admin/web-files', label: 'Fichiers Web', icon: 'fileText' },
      {
        href: '/super-admin/contradictions',
        label: 'Contradictions',
        icon: 'alertTriangle',
        badge: pendingContradictions || undefined,
        badgeVariant: 'secondary' as const,
      },
      { href: '/super-admin/amendments', label: 'Amendements JORT', icon: 'gavel' },
    ],
  },
  {
    group: 'IA & Qualité',
    items: [
      { href: '/super-admin/feedbacks', label: 'Feedbacks', icon: 'messageSquare' },
      { href: '/super-admin/evaluation', label: 'Évaluation RAG', icon: 'checkCircle' },
      { href: '/super-admin/compare-llm', label: 'Comparer LLMs', icon: 'columns', superAdminOnly: true },
      { href: '/super-admin/rag-audit', label: 'Audit RAG', icon: 'search' },
      { href: '/super-admin/classification', label: 'Classification', icon: 'tag' },
      { href: '/super-admin/notifications', label: 'Notifications', icon: 'bell' },
    ],
  },
  {
    group: 'Système',
    items: [
      { href: '/super-admin/web-sources/maintenance', label: 'Maintenance', icon: 'wrench' },
      { href: '/super-admin/audit-logs', label: "Journal d'audit", icon: 'shield' },
      { href: '/super-admin/backups', label: 'Sauvegardes', icon: 'database' },
    ],
  },
]

// NavLink expanded
interface NavLinkProps {
  item: NavItem
  isActive: boolean
  isCollapsed: boolean
  onCloseMobile?: () => void
}

const NavLink = memo(function NavLink({ item, isActive, isCollapsed, onCloseMobile }: NavLinkProps) {
  const Icon = Icons[item.icon]
  const hasBadge = !!item.badge

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={item.href} prefetch={true} onClick={onCloseMobile}>
            <div
              className={cn(
                'relative flex items-center justify-center rounded-lg p-2 transition-colors',
                'hover:bg-muted hover:text-foreground',
                isActive && 'bg-muted text-foreground border-l-4 border-primary'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {hasBadge && (
                <span
                  className={cn(
                    'absolute top-1 right-1 h-2 w-2 rounded-full',
                    item.badgeVariant === 'destructive' ? 'bg-red-500' : 'bg-blue-400'
                  )}
                />
              )}
            </div>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {item.label}
          {hasBadge && (
            <Badge variant={item.badgeVariant || 'default'} className="ml-1">
              {item.badge}
            </Badge>
          )}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Link href={item.href} prefetch={true} onClick={onCloseMobile}>
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-muted hover:text-foreground',
          isActive && 'bg-muted text-foreground border-l-4 border-primary'
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="truncate">{item.label}</span>
        {hasBadge && (
          <Badge variant={item.badgeVariant || 'default'} className="ml-auto">
            {item.badge}
          </Badge>
        )}
      </div>
    </Link>
  )
})

function SuperAdminSidebarComponent({
  pendingCount = 0,
  pendingContradictions = 0,
  pendingTaxonomySuggestions = 0,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
  userRole,
}: SuperAdminSidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isSuperAdmin = userRole === 'super_admin'

  const isActive = useCallback(
    (href: string) => {
      const [hrefPath, hrefQuery] = href.split('?')
      if (hrefQuery) {
        const hrefParams = new URLSearchParams(hrefQuery)
        if (pathname !== hrefPath) return false
        for (const [key, value] of hrefParams.entries()) {
          if (searchParams.get(key) !== value) return false
        }
        return true
      }
      return pathname === href || pathname?.startsWith(href + '/')
    },
    [pathname, searchParams]
  )

  const navGroups = useMemo(
    () =>
      getNavGroups(
        pendingCount,
        pendingContradictions,
        pendingTaxonomySuggestions
      ),
    [pendingCount, pendingContradictions, pendingTaxonomySuggestions]
  )

  const groupsWithState = useMemo(() => {
    return navGroups.map((group) => ({
      ...group,
      items: group.items
        .filter((item) => !item.superAdminOnly || isSuperAdmin)
        .map((item) => ({
          ...item,
          isActive: isActive(item.href),
        })),
    }))
  }, [isActive, navGroups, isSuperAdmin])

  const ToggleIcon = isCollapsed ? Icons.panelLeftOpen : Icons.panelLeftClose

  // Contenu partagé entre desktop et mobile
  const sidebarContent = (collapsed: boolean, showCloseBtn: boolean) => (
    <>
      {/* Header */}
      <div className="flex h-16 items-center border-b border-border px-3">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/super-admin/dashboard" prefetch={true} className="mx-auto" onClick={onCloseMobile}>
                <LogoIcon size="sm" />
              </Link>
            </TooltipTrigger>
            {process.env.NEXT_PUBLIC_APP_VERSION && (
              <TooltipContent side="right">v{process.env.NEXT_PUBLIC_APP_VERSION}</TooltipContent>
            )}
          </Tooltip>
        ) : (
          <div className="flex w-full items-center justify-between">
            <Link href="/super-admin/dashboard" prefetch={true} onClick={onCloseMobile}>
              <LogoHorizontal size="sm" variant="juridique" showTag={true} animate={false} />
            </Link>
            <div className="flex items-center gap-1">
              {process.env.NEXT_PUBLIC_APP_VERSION && (
                <span className="ml-1 shrink-0 font-mono text-[10px] text-muted-foreground select-none" title="Version de build">
                  v{process.env.NEXT_PUBLIC_APP_VERSION}
                </span>
              )}
              {showCloseBtn && (
                <button
                  onClick={onCloseMobile}
                  className="ml-2 flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Fermer le menu"
                >
                  <Icons.close className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toggle button (desktop only) */}
      {onToggleCollapse && !showCloseBtn && (
        <button
          onClick={onToggleCollapse}
          className="mx-auto my-2 flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={collapsed ? 'Étendre le menu' : 'Réduire le menu'}
        >
          <ToggleIcon className="h-4 w-4" />
        </button>
      )}

      {/* Navigation */}
      <nav className={cn('flex-1 space-y-4 overflow-y-auto', collapsed ? 'px-2 py-2' : 'p-4')}>
        {groupsWithState.map((group, groupIndex) => (
          <div key={group.group} className="space-y-1">
            {!collapsed && (
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.group}
              </h3>
            )}
            {collapsed && groupIndex > 0 && <Separator className="my-2" />}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={item.isActive}
                isCollapsed={collapsed}
                onCloseMobile={onCloseMobile}
              />
            ))}
            {!collapsed && groupIndex < groupsWithState.length - 1 && (
              <Separator className="my-4" />
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-2">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/dashboard" prefetch={true} onClick={onCloseMobile}>
                <div className="flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <Icons.arrowLeft className="h-5 w-5 shrink-0" />
                </div>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Retour au Dashboard</TooltipContent>
          </Tooltip>
        ) : (
          <Link href="/dashboard" prefetch={true} onClick={onCloseMobile}>
            <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <Icons.arrowLeft className="h-5 w-5 shrink-0" />
              <span>Retour au Dashboard</span>
            </div>
          </Link>
        )}
      </div>
    </>
  )

  return (
    <TooltipProvider delayDuration={150}>
      {/* Sidebar desktop – comportement inchangé */}
      <aside
        className={cn(
          'hidden md:flex h-screen flex-col border-r border-border bg-card text-foreground transition-all duration-300 ease-in-out',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {sidebarContent(isCollapsed, false)}
      </aside>

      {/* Sidebar mobile – drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen w-[280px] max-w-[85vw] flex-col md:hidden',
          'border-r border-border bg-card text-foreground',
          'transition-transform duration-300 ease-in-out',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent(false, true)}
      </aside>
    </TooltipProvider>
  )
}

export const SuperAdminSidebar = memo(SuperAdminSidebarComponent)
