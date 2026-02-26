import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import TimeEntryForm from '@/components/time-tracking/TimeEntryForm'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'

export default async function NewTimeEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ dossier_id?: string }>
}) {
  const params = await searchParams
  const session = await getSession()
  const t = await getTranslations('timeTracking')

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Récupérer tous les dossiers de l'utilisateur
  const dossiersResult = await query(
    'SELECT id, numero, objet FROM dossiers WHERE user_id = $1 ORDER BY numero DESC',
    [session.user.id]
  )
  const dossiers = dossiersResult.rows

  // Valider le dossier pré-sélectionné si fourni
  let dossierId = params.dossier_id || ''
  if (dossierId) {
    const found = dossiers.find((d: { id: string }) => d.id === dossierId)
    if (!found) dossierId = ''
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link href="/time-tracking">
            <Icons.arrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('newEntryTitle')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('newEntrySubtitle')}
          </p>
        </div>
      </div>

      {/* Formulaire */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <TimeEntryForm
          dossierId={dossierId || undefined}
          dossiers={dossiers}
        />
      </div>
    </div>
  )
}
