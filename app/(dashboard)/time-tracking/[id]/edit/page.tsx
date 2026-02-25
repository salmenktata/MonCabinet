import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import TimeEntryForm from '@/components/time-tracking/TimeEntryForm'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'

export default async function EditTimeEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Récupérer l'entrée
  const entryResult = await query(
    'SELECT * FROM time_entries WHERE id = $1 AND user_id = $2',
    [id, session.user.id]
  )
  const entry = entryResult.rows[0]

  if (!entry) notFound()

  // Bloquer si déjà facturée
  if (entry.facture_id) {
    redirect('/time-tracking')
  }

  // Récupérer tous les dossiers de l'utilisateur
  const dossiersResult = await query(
    'SELECT id, numero, objet FROM dossiers WHERE user_id = $1 ORDER BY numero DESC',
    [session.user.id]
  )
  const dossiers = dossiersResult.rows

  const initialData = {
    dossier_id: entry.dossier_id,
    description: entry.description,
    date:
      entry.date instanceof Date
        ? entry.date.toISOString().split('T')[0]
        : String(entry.date).split('T')[0],
    heure_debut: entry.heure_debut || undefined,
    heure_fin: entry.heure_fin || undefined,
    duree_minutes: entry.duree_minutes,
    taux_horaire: entry.taux_horaire ? parseFloat(entry.taux_horaire) : undefined,
    facturable: entry.facturable,
    notes: entry.notes || undefined,
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
          <h1 className="text-2xl font-bold text-foreground">Modifier l&apos;entrée de temps</h1>
          <p className="text-sm text-muted-foreground line-clamp-1">{entry.description}</p>
        </div>
      </div>

      {/* Formulaire */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <TimeEntryForm
          entryId={id}
          initialData={initialData}
          isEditing
          dossierId={entry.dossier_id}
          dossiers={dossiers}
        />
      </div>
    </div>
  )
}
