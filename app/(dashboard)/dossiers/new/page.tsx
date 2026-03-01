import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import DossierForm from '@/components/dossiers/DossierForm'
import { getTranslations } from 'next-intl/server'

interface NewDossierPageProps {
  searchParams: Promise<{ client_id?: string }>
}

export default async function NewDossierPage({ searchParams }: NewDossierPageProps) {
  const params = await searchParams
  const session = await getSession()
  const t = await getTranslations('dossiers')

  if (!session?.user?.id) return null

  // Récupérer tous les clients pour le formulaire
  const result = await query(
    'SELECT * FROM clients WHERE user_id = $1 ORDER BY created_at DESC',
    [session.user.id]
  )
  const clients = result.rows

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t('newDossier')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('createNewDossier')}
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <DossierForm
          clients={clients || []}
          preselectedClientId={params.client_id}
        />
      </div>
    </div>
  )
}
