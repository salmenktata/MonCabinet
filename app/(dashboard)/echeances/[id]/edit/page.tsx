import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect, notFound } from 'next/navigation'
import { EcheanceFormAdvanced } from '@/components/echeances/EcheanceFormAdvanced'

interface EditEcheancePageProps {
  params: Promise<{ id: string }>
}

export default async function EditEcheancePage({ params }: EditEcheancePageProps) {
  const { id } = await params
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Récupérer l'échéance en vérifiant l'appartenance via le dossier
  const result = await query(
    `SELECT e.*
     FROM echeances e
     JOIN dossiers d ON e.dossier_id = d.id
     WHERE e.id = $1 AND d.user_id = $2`,
    [id, session.user.id]
  )

  if (result.rows.length === 0) {
    notFound()
  }

  const echeance = result.rows[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Modifier l&apos;échéance</h1>
        <p className="mt-2 text-muted-foreground">
          Modifiez les informations de l&apos;échéance.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <EcheanceFormAdvanced
          echeanceId={echeance.id}
          dossierId={echeance.dossier_id}
          isEditing
          initialData={{
            dossier_id: echeance.dossier_id,
            type_echeance: echeance.type_echeance,
            titre: echeance.titre,
            description: echeance.description ?? undefined,
            date_echeance: echeance.date_echeance
              ? new Date(echeance.date_echeance).toISOString().split('T')[0]
              : '',
            date_point_depart: echeance.date_point_depart
              ? new Date(echeance.date_point_depart).toISOString().split('T')[0]
              : undefined,
            nombre_jours: echeance.nombre_jours ?? undefined,
            delai_type: echeance.delai_type ?? undefined,
            statut: echeance.statut,
            rappel_j15: echeance.rappel_j15 ?? false,
            rappel_j7: echeance.rappel_j7 ?? true,
            rappel_j3: echeance.rappel_j3 ?? true,
            rappel_j1: echeance.rappel_j1 ?? true,
            notes: echeance.notes ?? undefined,
          }}
        />
      </div>
    </div>
  )
}
