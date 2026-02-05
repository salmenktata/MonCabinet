'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { getWorkflowEtape, getWorkflowProgress } from '@/lib/workflows/civil'

interface DossierCardProps {
  dossier: any
}

export default function DossierCard({ dossier }: DossierCardProps) {
  const t = useTranslations('cards')
  const etapeActuelle = getWorkflowEtape(dossier.workflow_etape_actuelle || 'ASSIGNATION')
  const progress = getWorkflowProgress(dossier.workflow_etape_actuelle || 'ASSIGNATION')

  const clientName =
    dossier.clients?.type === 'PERSONNE_PHYSIQUE'
      ? `${dossier.clients.nom} ${dossier.clients.prenom || ''}`.trim()
      : dossier.clients?.denomination || t('unknownClient')

  return (
    <Link href={`/dossiers/${dossier.id}`}>
      <div className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-all hover:border-blue-300">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">
                {dossier.numero_dossier}
              </h3>
              <span
                className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
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

            <p className="mt-1 text-sm text-gray-600 line-clamp-2">
              {dossier.objet}
            </p>

            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <span>{clientName}</span>
              </div>

              {dossier.tribunal && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  <span>{dossier.tribunal}</span>
                </div>
              )}

              {etapeActuelle && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  <span className="font-medium">{etapeActuelle.nom}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Barre de progression */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">{t('progression')}</span>
            <span className="text-xs font-medium text-blue-600">{progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  )
}
