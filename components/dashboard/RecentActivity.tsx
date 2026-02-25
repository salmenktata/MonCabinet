import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    dot: 'bg-blue-500',
    color: 'text-blue-400',
  },
  dossier: {
    icon: Icons.dossiers,
    dot: 'bg-indigo-500',
    color: 'text-indigo-400',
  },
  facture: {
    icon: Icons.invoices,
    dot: 'bg-green-500',
    color: 'text-green-400',
  },
  document: {
    icon: Icons.documents,
    dot: 'bg-orange-500',
    color: 'text-orange-400',
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

  // Max 6 activités
  const recentActivities = activities.slice(0, 6)

  return (
    <Card className="bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icons.activity className="h-4 w-4 text-primary" />
          {t('recentActivity')}
        </CardTitle>
        <Link
          href="/clients"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('viewAll')}
        </Link>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {recentActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Icons.info className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">{t('noRecentActivity')}</p>
          </div>
        ) : (
          <div className="relative">
            {/* Ligne de timeline verticale */}
            <div className="absolute start-[7px] top-2 bottom-2 w-px bg-border/50" aria-hidden="true" />

            <div className="space-y-0.5">
              {recentActivities.map((activity) => {
                const config = activityConfig[activity.type]

                const content = (
                  <div className="flex items-start gap-3 py-2 ps-1 rounded-lg transition-colors hover:bg-accent/50">
                    <div className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0 ring-2 ring-background z-10', config.dot)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-tight">
                        <span className="font-medium">{activity.title}</span>{' '}
                        <span className="text-muted-foreground text-xs">{actionLabels[activity.action]}</span>
                      </p>
                      {activity.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{activity.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 pt-0.5">
                      {formatTimestamp(activity.timestamp)}
                    </span>
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
          </div>
        )}
      </CardContent>
    </Card>
  )
}
