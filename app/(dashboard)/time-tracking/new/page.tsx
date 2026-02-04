import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import TimeEntryForm from '@/components/time-tracking/TimeEntryForm'

export default async function NewTimeEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ dossier_id?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Récupérer le dossier présélectionné si fourni
  let dossierId = params.dossier_id || ''
  let tauxHoraire: number | undefined

  if (dossierId) {
    // Vérifier que le dossier appartient à l'utilisateur
    const { data: dossier } = await supabase
      .from('dossiers')
      .select('id')
      .eq('id', dossierId)
      .eq('user_id', user.id)
      .single()

    if (!dossier) {
      dossierId = ''
    }
  }

  // Récupérer le taux horaire par défaut du profil
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Si le profil a un taux horaire par défaut, l'utiliser (à ajouter au schéma profiles plus tard)
  // Pour l'instant, on utilise undefined

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* En-tête */}
      <div>
        <Link
          href="/time-tracking"
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          ← Retour au suivi du temps
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">
          Ajouter une entrée de temps
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Enregistrez le temps passé sur un dossier
        </p>
      </div>

      {/* Info */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-2">
          <svg
            className="h-5 w-5 text-blue-600 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-900">
              Conseil : Utilisez le timer
            </p>
            <p className="mt-1 text-sm text-blue-700">
              Pour un suivi automatique, démarrez un timer depuis la page d&apos;un dossier.
              Vous pourrez l&apos;arrêter quand vous aurez terminé votre travail.
            </p>
          </div>
        </div>
      </div>

      {/* Formulaire */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        {dossierId ? (
          <TimeEntryForm
            dossierId={dossierId}
            tauxHoraireDefaut={tauxHoraire}
          />
        ) : (
          <div>
            <p className="text-sm text-gray-700 mb-4">
              Veuillez d&apos;abord sélectionner un dossier :
            </p>
            <Link
              href="/dossiers"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Voir mes dossiers →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
