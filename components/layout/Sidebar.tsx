'use client'

import * as React from 'react'
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
]

export function Sidebar({ collapsed, onCollapse }: SidebarProps) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const tGroups = useTranslations('navGroups')

  React.useEffect(() => {
    // Sauvegarder l'état dans localStorage
    localStorage.setItem('sidebar-collapsed', JSON.stringify(collapsed))
  }, [collapsed])

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
          <Link href="/dashboard" className="text-2xl font-bold text-primary">
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
        {navGroups.map((group) => (
          <div key={group.group} className="space-y-1">
            {!collapsed && (
              <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {tGroups(group.group.toLowerCase())}
              </h3>
            )}
            {group.items.map((item) => {
              const Icon = Icons[item.icon]
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')

              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                      'hover:bg-accent hover:text-accent-foreground',
                      isActive && 'bg-accent text-accent-foreground border-l-4 border-primary',
                      collapsed && 'justify-center'
                    )}
                    title={collapsed ? t(item.label) : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span>{t(item.label)}</span>}
                    {!collapsed && item.badge && (
                      <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                        {item.badge}
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
            {!collapsed && group.group !== 'Documents' && (
              <Separator className="my-4" />
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-4">
        <Link href="/settings">
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
              'hover:bg-accent hover:text-accent-foreground',
              pathname === '/settings' && 'bg-accent text-accent-foreground',
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
