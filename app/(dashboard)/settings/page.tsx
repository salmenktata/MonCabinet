import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Icons } from '@/lib/icons'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export const metadata = {
  title: 'Paramètres - Qadhya',
  description: 'Gérer les paramètres de votre cabinet',
}

export default async function SettingsPage() {
  const session = await getSession()
  const t = await getTranslations('settings')

  if (!session?.user?.id) {
    redirect('/login')
  }

  const settingsCards = [
    {
      title: t('cabinetTitle'),
      description: t('cabinetDescription'),
      icon: 'building' as const,
      href: '/parametres/cabinet',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: t('notificationsTitle'),
      description: t('notificationsDescription'),
      icon: 'bell' as const,
      href: '/parametres/notifications',
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
    },
    {
      title: t('cloudStorageTitle'),
      description: t('cloudStorageDescription'),
      icon: 'cloud' as const,
      href: '/parametres/cloud-storage',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
        {settingsCards.map((card) => {
          const Icon = Icons[card.icon]
          return (
            <Link key={card.href} href={card.href}>
              <Card className="h-full transition-all hover:shadow-lg hover:border-primary cursor-pointer">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg ${card.bgColor}`}>
                      <Icon className={`h-6 w-6 ${card.color}`} />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">{card.title}</CardTitle>
                      <CardDescription className="text-sm">
                        {card.description}
                      </CardDescription>
                    </div>
                    <Icons.chevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
              </Card>
            </Link>
          )
        })}
      </div>

      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <div className="flex items-start gap-3">
            <Icons.info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <CardTitle className="text-blue-900 text-base mb-2">
                {t('userProfile')}
              </CardTitle>
              <CardDescription className="text-blue-800 text-sm">
                {t('userProfileInfo')}{' '}
                <Link href="/profile" className="underline font-medium">
                  {t('profilePageLink')}
                </Link>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    </div>
  )
}
