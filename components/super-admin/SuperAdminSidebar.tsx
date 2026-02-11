'use client'

import { memo, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { LogoHorizontal } from '@/components/ui/Logo'

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
  pendingCount?: number
  unreadNotifications?: number
  pendingReviews?: number
  pendingContradictions?: number
  pendingTaxonomySuggestions?: number
}

// Navigation Super Admin - Refonte Consolidation (Feb 2026)
const getNavGroups = (
  pendingCount: number,
  unreadNotifications: number,
  pendingReviews: number,
  pendingContradictions: number,
  pendingTaxonomySuggestions: number
): NavGroup[] => [
  // Groupe 1: Vue d'ensemble
  {
    group: 'Vue d\'ensemble',
    items: [
      { href: '/super-admin/dashboard', label: 'Tableau de bord', icon: 'dashboard' },
    ],
  },
  // Groupe 2: Gestion
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
    ],
  },
  // Groupe 3: Contenu (⚠️ NE PAS MODIFIER - Travail crawling/indexation prod)
  {
    group: 'Contenu',
    items: [
      { href: '/super-admin/knowledge-base', label: 'Base de connaissances', icon: 'bookOpen' },
      { href: '/super-admin/web-sources', label: 'Sources Web', icon: 'globe' },
      { href: '/super-admin/web-files', label: 'Fichiers Web', icon: 'file' },
      {
        href: '/super-admin/taxonomy',
        label: 'Taxonomie',
        icon: 'folder',
        badge: pendingTaxonomySuggestions || undefined,
        badgeVariant: 'secondary' as const
      },
    ],
  },
  // Groupe 4: Qualité (5 outils de monitoring qualité)
  {
    group: 'Qualité',
    items: [
      { href: '/super-admin/kb-management', label: 'Gestion KB', icon: 'database' },
      { href: '/super-admin/legal-quality', label: 'Legal Quality', icon: 'shield' },
      { href: '/super-admin/rag-audit', label: 'Audit RAG', icon: 'search' },
      {
        href: '/super-admin/review-queue',
        label: 'File de Revue',
        icon: 'fileText',
        badge: pendingReviews || undefined,
        badgeVariant: 'destructive' as const
      },
      {
        href: '/super-admin/contradictions',
        label: 'Contradictions',
        icon: 'alertTriangle',
        badge: pendingContradictions || undefined,
        badgeVariant: 'secondary' as const
      },
    ],
  },
  // Groupe 5: Monitoring (Dashboard unifié + Quotas)
  {
    group: 'Monitoring',
    items: [
      { href: '/super-admin/monitoring', label: 'Dashboard Monitoring', icon: 'activity' },
      { href: '/super-admin/quotas', label: 'Quotas & Alertes', icon: 'chartBar' },
    ],
  },
  // Groupe 6: Système
  {
    group: 'Système',
    items: [
      { href: '/super-admin/settings', label: 'Configuration', icon: 'settings' },
      { href: '/super-admin/audit-logs', label: 'Journal d\'audit', icon: 'shield' },
      { href: '/super-admin/backups', label: 'Sauvegardes', icon: 'database' },
    ],
  },
]

// Composant NavLink mémorisé
interface NavLinkProps {
  item: NavItem
  isActive: boolean
}

const NavLink = memo(function NavLink({ item, isActive }: NavLinkProps) {
  const Icon = Icons[item.icon]

  return (
    <Link href={item.href} prefetch={true}>
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-slate-800 hover:text-white',
          isActive && 'bg-slate-800 text-white border-l-4 border-blue-500'
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span>{item.label}</span>
        {item.badge && (
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
  pendingCount = 0,
  unreadNotifications = 0,
  pendingReviews = 0,
  pendingContradictions = 0,
  pendingTaxonomySuggestions = 0
}: SuperAdminSidebarProps) {
  const pathname = usePathname()

  // Mémorise la vérification d'active state
  const isActive = useCallback((href: string) => {
    return pathname === href || pathname?.startsWith(href + '/')
  }, [pathname])

  // Mémorise les items avec leurs états
  const navGroups = useMemo(
    () => getNavGroups(pendingCount, unreadNotifications, pendingReviews, pendingContradictions, pendingTaxonomySuggestions),
    [pendingCount, unreadNotifications, pendingReviews, pendingContradictions, pendingTaxonomySuggestions]
  )

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
    <aside className="flex h-screen w-64 flex-col border-r border-slate-700 bg-slate-900 text-slate-300">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-slate-700">
        <Link href="/super-admin/dashboard" prefetch={true}>
          <LogoHorizontal size="sm" variant="juridique" showTag={true} animate={false} />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 p-4 overflow-y-auto">
        {groupsWithState.map((group, groupIndex) => (
          <div key={group.group} className="space-y-1">
            <h3 className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {group.group}
            </h3>
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={item.isActive}
              />
            ))}
            {groupIndex < groupsWithState.length - 1 && (
              <Separator className="my-4 bg-slate-700" />
            )}
          </div>
        ))}
      </nav>

      {/* Footer - Retour au dashboard utilisateur */}
      <div className="border-t border-slate-700 p-4 space-y-1">
        <Link href="/dashboard" prefetch={true}>
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'text-slate-400 hover:bg-slate-800 hover:text-white'
            )}
          >
            <Icons.arrowLeft className="h-5 w-5 shrink-0" />
            <span>Retour au Dashboard</span>
          </div>
        </Link>
      </div>
    </aside>
  )
}

export const SuperAdminSidebar = memo(SuperAdminSidebarComponent)
