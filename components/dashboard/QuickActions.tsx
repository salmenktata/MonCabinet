import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'

interface QuickAction {
  title: string
  href: string
  icon: keyof typeof Icons
  variant: 'default' | 'primary' | 'success' | 'warning'
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
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => {
        const Icon = Icons[action.icon]
        return (
          <Button
            key={action.href}
            variant="outline"
            size="sm"
            asChild
            className="h-8 gap-1.5 text-xs font-medium"
          >
            <Link href={action.href}>
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{action.title}</span>
            </Link>
          </Button>
        )
      })}
    </div>
  )
}
