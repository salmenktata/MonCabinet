import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import DossierDetailContent from '@/components/dossiers/DossierDetailContent'

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

  const supabase = await createClient()

  // Récupérer le dossier
  const { data: dossier, error } = await supabase
    .from('dossiers')
    .select('*, clients(*)')
    .eq('id', id)
    .single()

  if (error || !dossier) {
    notFound()
  }

  // Récupérer les actions du dossier
  const { data: actions } = await supabase
    .from('actions')
    .select('*')
    .eq('dossier_id', id)
    .order('created_at', { ascending: false })

  // Récupérer les échéances
  const { data: echeances } = await supabase
    .from('echeances')
    .select('*')
    .eq('dossier_id', id)
    .order('date_evenement', { ascending: true })

  // Récupérer les documents
  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('dossier_id', id)
    .order('created_at', { ascending: false })

  const clientName =
    dossier.clients?.type === 'PERSONNE_PHYSIQUE'
      ? `${dossier.clients.nom} ${dossier.clients.prenom || ''}`.trim()
      : dossier.clients?.denomination || 'Client inconnu'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/dossiers" className="text-gray-500 hover:text-gray-700">
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
            <h1 className="text-3xl font-bold text-gray-900">
              {dossier.numero_dossier}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                dossier.statut === 'ACTIF'
                  ? 'bg-green-100 text-green-700'
                  : dossier.statut === 'CLOS'
                  ? 'bg-gray-100 text-gray-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {dossier.statut}
            </span>
          </div>
          <p className="mt-2 text-gray-600">{dossier.objet}</p>
          <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
            <span>Client: {clientName}</span>
            {dossier.tribunal && <span>Tribunal: {dossier.tribunal}</span>}
          </div>
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
