'use client'

import { memo, useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'

interface RevenusWidgetProps {
  factures: any[]
}

function RevenusWidgetComponent({ factures }: RevenusWidgetProps) {
  const t = useTranslations('dashboard.revenue')
  const locale = useLocale()

  // Calculs mémorisés pour éviter les recalculs inutiles
  const { revenusTotal, revenusPayes, revenusEnAttente, revenusImpayes, tauxPaiement } = useMemo(() => {
    const total = factures.reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0)
    const payes = factures
      .filter((f) => f.statut === 'PAYEE')
      .reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0)
    const enAttente = factures
      .filter((f) => f.statut === 'ENVOYEE')
      .reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0)
    const impayes = factures
      .filter((f) => f.statut === 'IMPAYEE')
      .reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0)
    const taux = total > 0 ? (payes / total) * 100 : 0

    return {
      revenusTotal: total,
      revenusPayes: payes,
      revenusEnAttente: enAttente,
      revenusImpayes: impayes,
      tauxPaiement: taux,
    }
  }, [factures])

  // Calcul des revenus par mois (3 derniers mois) - mémorisé
  const { derniersMois, maxMontant } = useMemo(() => {
    const mois = Array.from({ length: 3 }, (_, i) => {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      return {
        mois: d.toLocaleDateString(locale, { month: 'short', year: 'numeric' }),
        montant: 0,
      }
    }).reverse()

    factures.forEach((f) => {
      const dateFacture = new Date(f.date_emission)
      const moisFacture = dateFacture.toLocaleDateString(locale, {
        month: 'short',
        year: 'numeric',
      })
      const m = mois.find((m) => m.mois === moisFacture)
      if (m) {
        m.montant += parseFloat(f.montant_ttc || 0)
      }
    })

    return {
      derniersMois: mois,
      maxMontant: Math.max(...mois.map((m) => m.montant), 1),
    }
  }, [factures, locale])

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-card-foreground mb-4">{t('title')}</h2>

      {/* Statistiques principales */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg bg-green-100 dark:bg-green-900/20 p-4">
          <p className="text-xs font-medium text-green-600 dark:text-green-400">{t('paid')}</p>
          <p className="mt-1 text-2xl font-bold text-green-700 dark:text-green-400">
            {revenusPayes.toFixed(3)} <span className="text-sm">TND</span>
          </p>
        </div>

        <div className="rounded-lg bg-orange-100 dark:bg-orange-900/20 p-4">
          <p className="text-xs font-medium text-orange-600 dark:text-orange-400">{t('pending')}</p>
          <p className="mt-1 text-2xl font-bold text-orange-700 dark:text-orange-400">
            {revenusEnAttente.toFixed(3)} <span className="text-sm">TND</span>
          </p>
        </div>

        <div className="rounded-lg bg-red-100 dark:bg-red-900/20 p-4">
          <p className="text-xs font-medium text-red-600 dark:text-red-400">{t('unpaid')}</p>
          <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-400">
            {revenusImpayes.toFixed(3)} <span className="text-sm">TND</span>
          </p>
        </div>

        <div className="rounded-lg bg-blue-100 dark:bg-blue-900/20 p-4">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{t('total')}</p>
          <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-400">
            {revenusTotal.toFixed(3)} <span className="text-sm">TND</span>
          </p>
        </div>
      </div>

      {/* Taux de paiement */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium text-foreground">{t('paymentRate')}</span>
          <span className="font-semibold text-green-600 dark:text-green-400">{tauxPaiement.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 dark:bg-green-600 transition-all duration-300"
            style={{ width: `${tauxPaiement}%` }}
          />
        </div>
      </div>

      {/* Graphique simple des 3 derniers mois */}
      <div>
        <p className="text-sm font-medium text-foreground mb-3">{t('evolution3Months')}</p>
        <div className="flex items-end justify-between gap-2" style={{ height: '100px' }}>
          {derniersMois.map((mois) => (
            <div key={mois.mois} className="flex-1 flex flex-col items-center">
              <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                <div
                  className="w-full bg-blue-500 dark:bg-blue-600 rounded-t transition-all duration-300 hover:bg-blue-600 dark:hover:bg-blue-500"
                  style={{ height: `${(mois.montant / maxMontant) * 100}%` }}
                  title={`${mois.montant.toFixed(2)} TND`}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground text-center">{mois.mois}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default memo(RevenusWidgetComponent)
