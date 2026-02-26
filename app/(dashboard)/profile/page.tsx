import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import ProfileForm from '@/components/profile/ProfileForm'

export const metadata = {
  title: 'Mon Profil - Qadhya',
  description: 'Gérer vos informations personnelles',
}

export default async function ProfilePage() {
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  const t = await getTranslations('profile')

  // Récupérer le profil
  const result = await query(
    'SELECT * FROM profiles WHERE id = $1',
    [session.user.id]
  )
  const profile = result.rows[0]

  // Protection NULL safety: rediriger si profil non trouvé
  if (!profile) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <ProfileForm profile={profile} userEmail={session.user.email!} />
      </div>

      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <h3 className="font-semibold text-yellow-900">{t('importantInfoTitle')}</h3>
        <ul className="mt-2 space-y-1 text-sm text-yellow-800">
          <li>• {t('infoEmail')}</li>
          <li>• {t('infoPassword')}</li>
          <li>
            • {t('infoCabinet')}{' '}
            <a href="/parametres/cabinet" className="underline font-medium">
              {t('infoCabinetLink')}
            </a>
          </li>
        </ul>
      </div>
    </div>
  )
}
