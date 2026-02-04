import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import DocumentCard from '@/components/documents/DocumentCard'

export default async function DocumentsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Récupérer tous les documents de l'utilisateur
  const { data: documents, error } = await supabase
    .from('documents')
    .select(`
      *,
      dossiers (
        id,
        numero_dossier,
        objet,
        clients (
          nom,
          prenom,
          denomination,
          type
        )
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erreur chargement documents:', error)
  }

  // Statistiques
  const stats = {
    total: documents?.length || 0,
    contrats: documents?.filter((d) => d.categorie === 'contrat').length || 0,
    jugements: documents?.filter((d) => d.categorie === 'jugement').length || 0,
    correspondances: documents?.filter((d) => d.categorie === 'correspondance').length || 0,
    pieces: documents?.filter((d) => d.categorie === 'piece').length || 0,
    tailleTotal: documents?.reduce((acc, d) => acc + (d.taille_fichier || 0), 0) || 0,
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gérez tous vos documents juridiques
        </p>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">Total</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{stats.total}</p>
            </div>
            <div className="rounded-full bg-blue-100 p-3">
              <svg
                className="h-6 w-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Contrats</p>
          <p className="mt-1 text-2xl font-semibold text-blue-600">{stats.contrats}</p>
        </div>

        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Jugements</p>
          <p className="mt-1 text-2xl font-semibold text-purple-600">{stats.jugements}</p>
        </div>

        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Pièces</p>
          <p className="mt-1 text-2xl font-semibold text-yellow-600">{stats.pieces}</p>
        </div>

        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Stockage</p>
          <p className="mt-1 text-xl font-semibold text-indigo-600">
            {formatSize(stats.tailleTotal)}
          </p>
        </div>
      </div>

      {/* Liste des documents */}
      {!documents || documents.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun document</h3>
          <p className="mt-1 text-sm text-gray-500">
            Uploadez des documents depuis vos dossiers
          </p>
          <div className="mt-6">
            <Link
              href="/dossiers"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Voir mes dossiers →
            </Link>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            Tous les documents ({documents.length})
          </h2>
          <div className="grid gap-4">
            {documents.map((doc) => (
              <div key={doc.id}>
                <DocumentCard document={doc} />
                {doc.dossiers && (
                  <div className="mt-2 text-xs text-gray-500 pl-14">
                    📁 {doc.dossiers.numero_dossier} -{' '}
                    {doc.dossiers.clients?.type === 'PERSONNE_PHYSIQUE'
                      ? `${doc.dossiers.clients.nom} ${doc.dossiers.clients.prenom || ''}`.trim()
                      : doc.dossiers.clients?.denomination}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
