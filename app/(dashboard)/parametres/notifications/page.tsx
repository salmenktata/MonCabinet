import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import NotificationPreferencesForm from '@/components/parametres/NotificationPreferencesForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell } from 'lucide-react'

export const metadata = {
  title: 'Préférences Notifications - Paramètres',
  description: 'Gérer vos préférences de notifications email',
}

export default async function NotificationsPreferencesPage() {
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  const t = await getTranslations('settings')

  // Récupérer préférences actuelles (ou créer par défaut)
  const prefsResult = await query(
    'SELECT * FROM notification_preferences WHERE user_id = $1',
    [session.user.id]
  )
  let preferences = prefsResult.rows[0]

  // Si pas de préférences, créer avec valeurs par défaut
  if (!preferences) {
    const insertResult = await query(
      'INSERT INTO notification_preferences (user_id) VALUES ($1) RETURNING *',
      [session.user.id]
    )
    preferences = insertResult.rows[0]
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('notificationsTitle')}</h1>
        <p className="text-muted-foreground mt-2">
          {t('notificationsSubtitle')}
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <CardTitle>{t('notifPrefsTitle')}</CardTitle>
            </div>
            <CardDescription>
              {t('notifPrefsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NotificationPreferencesForm preferences={preferences} userId={session.user.id} />
          </CardContent>
        </Card>

        {/* Informations */}
        <Card>
          <CardHeader>
            <CardTitle>{t('notifAboutTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div>
              <h4 className="font-semibold text-foreground mb-2">{t('notifDailyEmailTitle')}</h4>
              <p>{t('notifDailyEmailDesc')}</p>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-2">{t('notifDeadlinesTitle')}</h4>
              <p>{t('notifDeadlinesDesc')}</p>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-2">{t('notifLegalDelaysTitle')}</h4>
              <p>{t('notifLegalDelaysDesc')}</p>
              <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                <li>Appel civil : 20 jours</li>
                <li>Appel commercial : 10 jours ⚠️</li>
                <li>Cassation : 60 jours</li>
                <li>Opposition : 10 jours</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-2">{t('notifUnpaidInvoicesTitle')}</h4>
              <p>{t('notifUnpaidInvoicesDesc')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
