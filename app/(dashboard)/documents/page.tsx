import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import DocumentCard from '@/components/documents/DocumentCard'
import { getTranslations } from 'next-intl/server'

export default async function DocumentsPage() {
  const t = await getTranslations('documents')
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Récupérer tous les documents de l'utilisateur
  const result = await query(
    `SELECT doc.*,
      json_build_object(
        'id', d.id,
        'numero', d.numero,
        'objet', d.objet,
        'clients', json_build_object(
          'nom', c.nom,
          'prenom', c.prenom,
          'type_client', c.type_client
        )
      ) as dossiers
    FROM documents doc
    LEFT JOIN dossiers d ON doc.dossier_id = d.id
    LEFT JOIN clients c ON d.client_id = c.id
    WHERE doc.user_id = $1
    ORDER BY doc.created_at DESC`,
    [session.user.id]
  )
  const documents = result.rows

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
        <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('total')}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{stats.total}</p>
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

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">{t('contracts')}</p>
          <p className="mt-1 text-2xl font-semibold text-blue-600">{stats.contrats}</p>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">{t('judgments')}</p>
          <p className="mt-1 text-2xl font-semibold text-purple-600">{stats.jugements}</p>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">{t('pieces')}</p>
          <p className="mt-1 text-2xl font-semibold text-yellow-600">{stats.pieces}</p>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">{t('storage')}</p>
          <p className="mt-1 text-xl font-semibold text-indigo-600">
            {formatSize(stats.tailleTotal)}
          </p>
        </div>
      </div>

      {/* Liste des documents */}
      {!documents || documents.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-muted-foreground"
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
          <p className="mt-2 text-sm font-medium text-foreground">{t('noDocuments')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('createFirstDocument')}
          </p>
          <div className="mt-6">
            <Link
              href="/dossiers"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t('viewDossiers')} →
            </Link>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            {t('allDocuments')} ({documents.length})
          </h2>
          <div className="grid gap-4">
            {documents.map((doc) => (
              <div key={doc.id}>
                <DocumentCard document={doc} />
                {doc.dossiers && (
                  <div className="mt-2 text-xs text-muted-foreground pl-14">
                    📁 {doc.dossiers.numero} -{' '}
                    {doc.dossiers.clients?.type_client === 'personne_physique'
                      ? `${doc.dossiers.clients.nom} ${doc.dossiers.clients.prenom || ''}`.trim()
                      : doc.dossiers.clients?.nom}
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
