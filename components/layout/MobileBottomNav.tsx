'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Sidebar } from './Sidebar'

interface MobileBottomNavProps {
  userRole?: string
}

interface NavItem {
  href: string
  labelKey: string
  icon: keyof typeof Icons
  highlighted?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: 'dashboard' },
  { href: '/dossiers', labelKey: 'dossiers', icon: 'dossiers' },
  { href: '/qadhya-ia/chat', labelKey: 'qadhyaIAChat', icon: 'sparkles', highlighted: true },
  { href: '/clients', labelKey: 'clients', icon: 'clients' },
]

export function MobileBottomNav({ userRole }: MobileBottomNavProps) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/')

  return (
    <>
      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-40 lg:hidden',
          'border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
          'pb-[env(safe-area-inset-bottom)]'
        )}
        aria-label="Navigation mobile"
      >
        <div className="flex h-16 items-center justify-around px-1">
          {NAV_ITEMS.map((item) => {
            const Icon = Icons[item.icon]
            const active = isActive(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 min-w-[60px] px-1 py-1.5 rounded-xl',
                  'transition-colors',
                  active
                    ? item.highlighted
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <div className={cn(
                  'flex items-center justify-center rounded-full w-8 h-8 transition-colors',
                  active && item.highlighted && 'bg-indigo-100 dark:bg-indigo-950',
                  active && !item.highlighted && 'bg-accent'
                )}>
                  <Icon className={cn(
                    'h-5 w-5',
                    item.highlighted && 'stroke-[1.75]'
                  )} />
                </div>
                <span className={cn(
                  'text-[10px] font-medium leading-none',
                  item.highlighted && active && 'text-indigo-600 dark:text-indigo-400'
                )}>
                  {item.labelKey === 'qadhyaIAChat' ? 'Qadhya IA' : t(item.labelKey)}
                </span>
              </Link>
            )
          })}

          {/* Bouton Plus → ouvre le drawer Sidebar */}
          <button
            onClick={() => setDrawerOpen(true)}
            className={cn(
              'flex flex-col items-center gap-0.5 min-w-[60px] px-1 py-1.5 rounded-xl',
              'transition-colors text-muted-foreground hover:text-foreground'
            )}
            aria-label="Ouvrir le menu complet"
          >
            <div className="flex items-center justify-center rounded-full w-8 h-8">
              <Icons.moreHorizontal className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-medium leading-none">Plus</span>
          </button>
        </div>
      </nav>

      {/* Drawer Sidebar complet pour "Plus" */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="p-0 w-72">
          <Sidebar userRole={userRole} onClose={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
