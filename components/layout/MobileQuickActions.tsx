'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Sidebar } from './Sidebar'

interface QuickAction {
  href: string
  labelKey: string
  icon: keyof typeof Icons
  color: string
  bgColor: string
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    href: '/dossiers?new=true',
    labelKey: 'newDossier',
    icon: 'dossiers',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/50',
  },
  {
    href: '/clients?new=true',
    labelKey: 'newClient',
    icon: 'clients',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/50',
  },
  {
    href: '/echeances?new=true',
    labelKey: 'newDeadline',
    icon: 'deadlines',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/50',
  },
  {
    href: '/factures?new=true',
    labelKey: 'newInvoice',
    icon: 'invoices',
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-50 dark:bg-violet-950/50',
  },
  {
    href: '/time-tracking',
    labelKey: 'timeTracking',
    icon: 'timeTracking',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/50',
  },
  {
    href: '/documents',
    labelKey: 'documents',
    icon: 'documents',
    color: 'text-slate-600 dark:text-slate-400',
    bgColor: 'bg-slate-50 dark:bg-slate-950/50',
  },
]

interface MobileQuickActionsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userRole?: string
}

export function MobileQuickActions({ open, onOpenChange, userRole }: MobileQuickActionsProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const actionLabels: Record<string, string> = {
    newDossier: 'Dossier',
    newClient: 'Client',
    newDeadline: 'Échéance',
    newInvoice: 'Facture',
    timeTracking: 'Temps',
    documents: 'Documents',
  }

  return (
    <>
      {/* Bottom sheet actions rapides */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            'rounded-t-2xl p-0',
            'pb-[env(safe-area-inset-bottom)]',
            'max-h-[85vh]'
          )}
        >
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle className="text-base font-semibold text-left">
              Actions rapides
            </SheetTitle>
          </SheetHeader>

          {/* Grille 3 colonnes */}
          <div className="grid grid-cols-3 gap-3 px-6 pb-5">
            {QUICK_ACTIONS.map((action) => {
              const Icon = Icons[action.icon]
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    'flex flex-col items-center gap-2 p-3 rounded-2xl',
                    'transition-all active:scale-95',
                    action.bgColor
                  )}
                >
                  <div className={cn('p-2.5 rounded-xl bg-white/70 dark:bg-black/20 shadow-sm')}>
                    <Icon className={cn('h-5 w-5', action.color)} />
                  </div>
                  <span className={cn('text-[11px] font-medium text-center leading-tight', action.color)}>
                    {actionLabels[action.labelKey]}
                  </span>
                </Link>
              )
            })}
          </div>

          {/* Séparateur + accès navigation complète */}
          <div className="border-t px-6 py-4">
            <button
              onClick={() => {
                onOpenChange(false)
                setSidebarOpen(true)
              }}
              className={cn(
                'w-full flex items-center justify-between',
                'text-sm font-medium text-muted-foreground',
                'hover:text-foreground transition-colors',
                'py-2 px-3 rounded-xl hover:bg-accent'
              )}
            >
              <span>Toute la navigation</span>
              <Icons.chevronRight className="h-4 w-4" />
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Drawer sidebar complète (depuis "Toute la navigation") */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-72">
          <Sidebar userRole={userRole} onClose={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
