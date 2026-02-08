import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface Activity {
  id: string
  type: 'client' | 'dossier' | 'facture' | 'document'
  action: 'created' | 'updated' | 'deleted' | 'paid'
  title: string
  description?: string
  timestamp: string
  href?: string
}

interface RecentActivityProps {
  activities: Activity[]
}

const activityConfig = {
  client: {
    icon: Icons.user,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-100 dark:bg-blue-900/20',
  },
  dossier: {
    icon: Icons.dossiers,
    color: 'text-indigo-600 dark:text-indigo-400',
    bg: 'bg-indigo-100 dark:bg-indigo-900/20',
  },
  facture: {
    icon: Icons.invoices,
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-100 dark:bg-green-900/20',
  },
  document: {
    icon: Icons.documents,
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-100 dark:bg-orange-900/20',
  },
}

export function RecentActivity({ activities }: RecentActivityProps) {
  const t = useTranslations('activity')
  const locale = useLocale()

  const actionLabels: Record<Activity['action'], string> = {
    created: t('created'),
    updated: t('modified'),
    deleted: t('deleted'),
    paid: t('paid'),
  }

  // Fonction pour formater le timestamp de manière relative
  const formatTimestamp = (timestamp: string) => {
    const now = new Date()
    const date = new Date(timestamp)
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return t('justNow')
    if (diffMins < 60) return t('minutesAgo', { minutes: diffMins })
    if (diffHours < 24) return t('hoursAgo', { hours: diffHours })
    if (diffDays === 1) return t('yesterday')
    if (diffDays < 7) return t('daysAgo', { days: diffDays })

    return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  }

  // Limiter à 10 activités
  const recentActivities = activities.slice(0, 10)

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-3 sm:pb-4">
        <CardTitle className="text-lg sm:text-xl font-semibold">
          <div className="flex items-center gap-2">
            <Icons.activity className="h-5 w-5 text-primary" />
            {t('recentActivity')}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {recentActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Icons.info className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {t('noRecentActivity')}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {recentActivities.map((activity, index) => {
              const config = activityConfig[activity.type]
              const IconComponent = config.icon
              const content = (
                <div className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-accent">
                  <div className={cn('rounded-full p-2 shrink-0', config.bg)}>
                    <IconComponent className={cn('h-4 w-4', config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {activity.title}{' '}
                      <span className="text-muted-foreground font-normal">
                        {actionLabels[activity.action]}
                      </span>
                    </p>
                    {activity.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {activity.description}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {formatTimestamp(activity.timestamp)}
                  </div>
                </div>
              )

              if (activity.href) {
                return (
                  <Link key={activity.id} href={activity.href}>
                    {content}
                  </Link>
                )
              }

              return <div key={activity.id}>{content}</div>
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
