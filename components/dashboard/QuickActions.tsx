import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface QuickAction {
  title: string
  href: string
  icon: keyof typeof Icons
  variant: 'default' | 'primary' | 'success' | 'warning'
}

const variantStyles = {
  default: 'bg-muted/50 text-muted-foreground hover:bg-muted',
  primary: 'bg-primary/10 text-primary hover:bg-primary/20',
  success: 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/30',
  warning: 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/30',
}

export function QuickActions() {
  const t = useTranslations('dashboard')

  const actions: QuickAction[] = [
    {
      title: t('newClient'),
      href: '/clients/new',
      icon: 'clients',
      variant: 'primary',
    },
    {
      title: t('newDossier'),
      href: '/dossiers/new',
      icon: 'dossiers',
      variant: 'success',
    },
    {
      title: t('newInvoice'),
      href: '/factures/new',
      icon: 'invoices',
      variant: 'warning',
    },
    {
      title: t('newTemplate'),
      href: '/templates/new',
      icon: 'templates',
      variant: 'default',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">
          <div className="flex items-center gap-2">
            <Icons.zap className="h-5 w-5 text-primary" />
            {t('quickActions')}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {actions.map((action) => {
            const Icon = Icons[action.icon]
            return (
              <Link key={action.href} href={action.href}>
                <div
                  className={cn(
                    'flex flex-col items-center gap-2 sm:gap-3 rounded-lg border p-3 sm:p-4 transition-all hover:shadow-md',
                    'text-center'
                  )}
                >
                  <div className={cn('rounded-full p-3', variantStyles[action.variant])}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium">{action.title}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
