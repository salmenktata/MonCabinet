import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import DossierDetailContent from '@/components/dossiers/DossierDetailContent'
import ChatWidget from '@/components/dossiers/ChatWidget'
import { getTranslations } from 'next-intl/server'

interface DossierDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

export default async function DossierDetailPage({
  params,
  searchParams,
}: DossierDetailPageProps) {
  const { id } = await params
  const { tab } = await searchParams

  const session = await getSession()
  const t = await getTranslations('dossiers')

  if (!session?.user?.id) return null

  // Récupérer toutes les données EN PARALLÈLE (optimisation performance)
  const [dossierResult, actionsResult, echeancesResult, documentsResult] = await Promise.all([
    query(
      `SELECT d.*,
        json_build_object(
          'id', c.id,
          'type_client', c.type_client,
          'nom', c.nom,
          'prenom', c.prenom,
          'email', c.email,
          'telephone', c.telephone,
          'created_at', c.created_at,
          'user_id', c.user_id
        ) as clients
      FROM dossiers d
      LEFT JOIN clients c ON d.client_id = c.id
      WHERE d.id = $1 AND d.user_id = $2`,
      [id, session.user.id]
    ),
    query(
      'SELECT * FROM actions WHERE dossier_id = $1 AND user_id = $2 ORDER BY created_at DESC',
      [id, session.user.id]
    ),
    query(
      'SELECT * FROM echeances WHERE dossier_id = $1 AND user_id = $2 ORDER BY date_evenement ASC',
      [id, session.user.id]
    ),
    query(
      'SELECT * FROM documents WHERE dossier_id = $1 AND user_id = $2 ORDER BY created_at DESC',
      [id, session.user.id]
    ),
  ])

  const dossier = dossierResult.rows[0]
  const actions = actionsResult.rows
  const echeances = echeancesResult.rows
  const documents = documentsResult.rows

  if (!dossier) {
    notFound()
  }

  const clientName =
    dossier.clients?.type_client === 'personne_physique'
      ? `${dossier.clients.nom} ${dossier.clients.prenom || ''}`.trim()
      : dossier.clients?.nom || 'Client inconnu'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/dossiers" className="text-muted-foreground hover:text-foreground">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <h1 className="text-3xl font-bold text-foreground">
              {dossier.numero}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                dossier.statut === 'en_cours'
                  ? 'bg-green-100 text-green-700'
                  : dossier.statut === 'clos'
                  ? 'bg-muted text-foreground'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {dossier.statut}
            </span>
          </div>
          <p className="mt-2 text-muted-foreground">{dossier.objet}</p>
          <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
            <span>{t('clientLabel')} {clientName}</span>
            {dossier.tribunal && <span>{t('tribunalLabel')} {dossier.tribunal}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChatWidget dossierId={dossier.id} dossierNumero={dossier.numero} />
        </div>
      </div>

      <DossierDetailContent
        dossier={dossier}
        actions={actions || []}
        echeances={echeances || []}
        documents={documents || []}
        initialTab={tab || 'workflow'}
      />
    </div>
  )
}
