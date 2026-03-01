'use client'

import { notFound, useParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useDossier } from '@/lib/hooks/useDossiers'
import DossierDetailContent from '@/components/dossiers/DossierDetailContent'
import ChatWidget from '@/components/dossiers/ChatWidget'

export default function DossierDetailPage() {
  const params = useParams()
  const id = params?.id as string
  const t = useTranslations('dossiers')

  const { data: dossier, isLoading, error } = useDossier(id, {
    enabled: !!id,
  })

  // Gestion erreur
  if (error) {
    if (error.message.includes('404') || error.message.includes('non trouvé')) {
      notFound()
    }

    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          Erreur lors du chargement du dossier: {error.message}
        </p>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 animate-pulse rounded bg-muted" />
            <div className="h-4 w-96 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Chargement du dossier...</span>
          </div>
        </div>
      </div>
    )
  }

  // Pas de dossier
  if (!dossier) {
    notFound()
  }

  const clientName =
    dossier.client?.typeClient === 'personne_physique'
      ? `${dossier.client.nom} ${dossier.client.prenom || ''}`.trim()
      : dossier.client?.nom || 'Client inconnu'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/dossiers" className="text-muted-foreground hover:text-foreground shrink-0">
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
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              {dossier.numero}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                dossier.status === 'in_progress'
                  ? 'bg-green-100 text-green-700'
                  : dossier.status === 'closed'
                  ? 'bg-muted text-foreground'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {dossier.status === 'in_progress'
                ? 'En cours'
                : dossier.status === 'closed'
                ? 'Clos'
                : dossier.status === 'open'
                ? 'Ouvert'
                : dossier.statut}
            </span>
          </div>
          <p className="mt-2 text-muted-foreground">{dossier.objet}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{t('clientLabel')} {clientName}</span>
            {dossier.tribunal && <span>{t('tribunalLabel')} {dossier.tribunal}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChatWidget dossierId={dossier.id} dossierNumero={dossier.numero || dossier.id} />
        </div>
      </div>

      <DossierDetailContent
        dossier={dossier}
        actions={dossier.actions || []}
        echeances={dossier.echeances || []}
        documents={dossier.documents || []}
        initialTab="workflow"
      />
    </div>
  )
}
