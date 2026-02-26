import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import CabinetForm from '@/components/parametres/CabinetForm'

export const metadata = {
  title: 'Paramètres Cabinet - Qadhya',
  description: 'Gérer les informations de votre cabinet',
}

export default async function CabinetParametresPage() {
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  const t = await getTranslations('settings')

  // Récupérer le profil avec les infos cabinet
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
        <h1 className="text-3xl font-bold">{t('cabinetTitle')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('cabinetSubtitle')}
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <CabinetForm profile={profile} />
      </div>

      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <h3 className="font-semibold text-yellow-900">ℹ️ {t('cabinetImportantTitle')}</h3>
        <ul className="mt-2 space-y-1 text-sm text-yellow-800">
          <li>• {t('cabinetInfo1')}</li>
          <li>• {t('cabinetInfo2')}</li>
          <li>• {t('cabinetInfo3')}</li>
          <li>• {t('cabinetInfo4')}</li>
        </ul>
      </div>
    </div>
  )
}
