'use client'

import { useTranslations } from 'next-intl'
import type { ExtractedParty } from '@/lib/ai/dossier-structuring-service'

interface PartiesSectionProps {
  client: ExtractedParty
  partieAdverse: ExtractedParty
}

export default function PartiesSection({
  client,
  partieAdverse,
}: PartiesSectionProps) {
  const t = useTranslations('assistant')

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">&#128101;</span>
        <h3 className="text-lg font-semibold text-foreground">
          {t('parties.title')}
        </h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Client */}
        <PartyCard
          party={client}
          isClient={true}
          roleLabel={
            client.role === 'demandeur'
              ? t('parties.clientDemandeur')
              : t('parties.clientDefendeur')
          }
        />

        {/* Partie adverse */}
        <PartyCard
          party={partieAdverse}
          isClient={false}
          roleLabel={
            partieAdverse.role === 'demandeur'
              ? t('parties.adverseDemandeur')
              : t('parties.adverseDefendeur')
          }
        />
      </div>
    </div>
  )
}

interface PartyCardProps {
  party: ExtractedParty
  isClient: boolean
  roleLabel: string
}

function PartyCard({ party, isClient, roleLabel }: PartyCardProps) {
  const t = useTranslations('assistant')

  return (
    <div
      className={`rounded-lg border p-4 ${
        isClient ? 'border-blue-200 bg-blue-50/50' : 'border-red-200 bg-red-50/50'
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isClient
              ? 'bg-blue-100 text-blue-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          {roleLabel}
        </span>
      </div>

      <h4 className="text-lg font-semibold text-foreground">
        {party.nom}
        {party.prenom && ` ${party.prenom}`}
      </h4>

      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
        {party.profession && (
          <p>
            <span className="font-medium">{t('parties.profession')}:</span>{' '}
            {party.profession}
          </p>
        )}
        {party.revenus != null && party.revenus > 0 && (
          <p>
            <span className="font-medium">{t('parties.revenus')}:</span>{' '}
            {party.revenus.toLocaleString('fr-TN')} TND/mois
          </p>
        )}
        {party.adresse && (
          <p>
            <span className="font-medium">{t('parties.adresse')}:</span>{' '}
            {party.adresse}
          </p>
        )}
      </div>
    </div>
  )
}
