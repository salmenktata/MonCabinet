'use client'

import { useTranslations } from 'next-intl'
import type {
  ExtractedFact,
  ExtractedChild,
  SpecificData,
} from '@/lib/ai/dossier-structuring-service'

interface FactsSectionProps {
  faits: ExtractedFact[]
  enfants?: ExtractedChild[] | null
  donneesSpecifiques: SpecificData
}

const TYPE_ICONS: Record<string, string> = {
  date: '&#128197;',
  montant: '&#128176;',
  personne: '&#128100;',
  bien: '&#127968;',
  duree: '&#9203;',
  lieu: '&#128205;',
  autre: '&#128204;',
}

export default function FactsSection({
  faits,
  enfants,
  donneesSpecifiques,
}: FactsSectionProps) {
  const t = useTranslations('assistant')

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">&#128221;</span>
        <h3 className="text-lg font-semibold text-foreground">
          {t('facts.title')}
        </h3>
      </div>

      <div className="space-y-6">
        {/* Faits extraits */}
        {faits.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {faits.map((fait, index) => (
              <div
                key={index}
                className="flex items-start gap-3 rounded-lg bg-muted/50 p-3"
              >
                <span
                  className="text-lg"
                  dangerouslySetInnerHTML={{
                    __html: TYPE_ICONS[fait.type] || TYPE_ICONS.autre,
                  }}
                />
                <div>
                  <span className="text-sm text-muted-foreground">
                    {fait.label}
                  </span>
                  <p className="font-medium text-foreground">{fait.valeur}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Enfants (si divorce) */}
        {enfants && enfants.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
              <span>&#128118;</span> {t('facts.children')} ({enfants.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {enfants.map((enfant, index) => (
                <div
                  key={index}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    enfant.estMineur
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {enfant.prenom}, {enfant.age} ans
                  {enfant.estMineur && (
                    <span className="ml-1 text-xs">({t('facts.minor')})</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Données spécifiques */}
        {donneesSpecifiques && Object.keys(donneesSpecifiques).length > 0 && (
          <SpecificDataSection data={donneesSpecifiques} />
        )}
      </div>
    </div>
  )
}

function SpecificDataSection({ data }: { data: SpecificData }) {
  const t = useTranslations('assistant')

  const entries = Object.entries(data).filter(
    ([, value]) => value != null && value !== '' && (Array.isArray(value) ? value.length > 0 : true)
  )

  if (entries.length === 0) return null

  return (
    <div className="border-t pt-4">
      <h4 className="text-sm font-semibold text-foreground mb-3">
        {t('facts.specificData')}
      </h4>
      <div className="space-y-2">
        {/* Biens communs */}
        {data.biensCommuns && data.biensCommuns.length > 0 && (
          <div>
            <span className="text-sm text-muted-foreground">
              &#127968; {t('facts.commonAssets')}:
            </span>
            <div className="mt-1 space-y-1">
              {data.biensCommuns.map((bien, index) => (
                <div
                  key={index}
                  className="flex justify-between rounded bg-muted/50 px-3 py-1.5 text-sm"
                >
                  <span>{bien.description}</span>
                  <span className="font-medium">
                    {bien.valeur.toLocaleString('fr-TN')} TND
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Demandes adverses */}
        {data.demandesAdverses && data.demandesAdverses.length > 0 && (
          <div>
            <span className="text-sm text-muted-foreground">
              &#9888; {t('facts.adverseDemands')}:
            </span>
            <ul className="mt-1 list-disc list-inside text-sm">
              {data.demandesAdverses.map((demande, index) => (
                <li key={index}>{demande}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Données individuelles */}
        {data.dateMarriage && (
          <div className="text-sm">
            <span className="text-muted-foreground">
              {t('facts.marriageDate')}:
            </span>{' '}
            <span className="font-medium">{data.dateMarriage}</span>
            {data.lieuMarriage && ` (${data.lieuMarriage})`}
          </div>
        )}

        {data.montantPrincipal != null && (
          <div className="text-sm">
            <span className="text-muted-foreground">
              {t('facts.principalAmount')}:
            </span>{' '}
            <span className="font-medium">
              {data.montantPrincipal.toLocaleString('fr-TN')} TND
            </span>
          </div>
        )}

        {data.dateCreance && (
          <div className="text-sm">
            <span className="text-muted-foreground">
              {t('facts.debtDate')}:
            </span>{' '}
            <span className="font-medium">{data.dateCreance}</span>
          </div>
        )}

        {data.tribunal && (
          <div className="text-sm">
            <span className="text-muted-foreground">
              {t('facts.tribunal')}:
            </span>{' '}
            <span className="font-medium">{data.tribunal}</span>
          </div>
        )}
      </div>
    </div>
  )
}
