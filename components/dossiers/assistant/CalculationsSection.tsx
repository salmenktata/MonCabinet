'use client'

import { useTranslations } from 'next-intl'
import type { LegalCalculation } from '@/lib/ai/dossier-structuring-service'

interface CalculationsSectionProps {
  calculs: LegalCalculation[]
}

const TYPE_CONFIG: Record<string, { icon: string; colorClass: string }> = {
  moutaa: { icon: '&#128141;', colorClass: 'border-pink-200 bg-pink-50' },
  pension_alimentaire: {
    icon: '&#128118;',
    colorClass: 'border-amber-200 bg-amber-50',
  },
  pension_epouse: {
    icon: '&#128105;',
    colorClass: 'border-purple-200 bg-purple-50',
  },
  interets_moratoires: {
    icon: '&#128176;',
    colorClass: 'border-emerald-200 bg-emerald-50',
  },
  indemnite_forfaitaire: {
    icon: '&#128181;',
    colorClass: 'border-blue-200 bg-blue-50',
  },
  autre: { icon: '&#128200;', colorClass: 'border-gray-200 bg-gray-50' },
}

export default function CalculationsSection({
  calculs,
}: CalculationsSectionProps) {
  const t = useTranslations('assistant')

  if (calculs.length === 0) return null

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">&#129518;</span>
        <h3 className="text-lg font-semibold text-foreground">
          {t('calculations.title')}
        </h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {calculs.map((calcul, index) => {
          const config = TYPE_CONFIG[calcul.type] || TYPE_CONFIG.autre

          return (
            <div
              key={index}
              className={`rounded-lg border p-4 ${config.colorClass}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xl"
                    dangerouslySetInnerHTML={{ __html: config.icon }}
                  />
                  <h4 className="font-semibold text-foreground">
                    {calcul.label}
                  </h4>
                </div>
              </div>

              <div className="mt-3">
                <div className="text-3xl font-bold text-foreground">
                  {(calcul.montant ?? 0).toLocaleString('fr-TN', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}{' '}
                  <span className="text-lg font-normal">TND</span>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-sm">
                <div className="rounded bg-white/50 px-2 py-1">
                  <span className="text-muted-foreground">
                    {t('calculations.formula')}:
                  </span>{' '}
                  <span className="font-mono text-foreground">
                    {calcul.formule}
                  </span>
                </div>

                {calcul.details && (
                  <p className="text-muted-foreground">{calcul.details}</p>
                )}
              </div>

              <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                <span>&#128218;</span>
                <span>{calcul.reference}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
