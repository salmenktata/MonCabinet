'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { MobileQuickActions } from './MobileQuickActions'

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
  const [quickActionsOpen, setQuickActionsOpen] = useState(false)

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
                  'relative flex flex-col items-center gap-0.5 min-w-[60px] px-1 py-1.5 rounded-xl',
                  'transition-colors',
                  active
                    ? item.highlighted
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-current={active ? 'page' : undefined}
              >
                {/* Indicateur actif animé (pill) */}
                {active && (
                  <motion.span
                    layoutId="mobile-nav-active"
                    className={cn(
                      'absolute inset-0 rounded-xl',
                      item.highlighted
                        ? 'bg-indigo-50 dark:bg-indigo-950/60'
                        : 'bg-accent'
                    )}
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  />
                )}

                <div className="relative z-10 flex items-center justify-center w-8 h-8">
                  <Icon className={cn(
                    'h-5 w-5',
                    item.highlighted && 'stroke-[1.75]'
                  )} />
                </div>
                <span className={cn(
                  'relative z-10 text-[10px] font-medium leading-none',
                  item.highlighted && active && 'text-indigo-600 dark:text-indigo-400'
                )}>
                  {item.labelKey === 'qadhyaIAChat' ? 'Qadhya IA' : t(item.labelKey)}
                </span>
              </Link>
            )
          })}

          {/* Bouton Plus → ouvre Quick Actions */}
          <button
            onClick={() => setQuickActionsOpen(true)}
            className={cn(
              'flex flex-col items-center gap-0.5 min-w-[60px] px-1 py-1.5 rounded-xl',
              'transition-colors text-muted-foreground hover:text-foreground'
            )}
            aria-label="Actions rapides et navigation"
          >
            <div className="flex items-center justify-center w-8 h-8">
              <Icons.moreHorizontal className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-medium leading-none">Plus</span>
          </button>
        </div>
      </nav>

      <MobileQuickActions
        open={quickActionsOpen}
        onOpenChange={setQuickActionsOpen}
        userRole={userRole}
      />
    </>
  )
}
