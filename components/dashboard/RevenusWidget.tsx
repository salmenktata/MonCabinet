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
    <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">{t('title')}</h2>

      {/* Statistiques principales */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('paid')}</p>
          <p className="mt-1 text-lg font-bold text-green-400 leading-none">
            {revenusPayes.toFixed(3)} <span className="text-xs font-normal">TND</span>
          </p>
        </div>

        <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('pending')}</p>
          <p className="mt-1 text-lg font-bold text-orange-400 leading-none">
            {revenusEnAttente.toFixed(3)} <span className="text-xs font-normal">TND</span>
          </p>
        </div>

        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('unpaid')}</p>
          <p className="mt-1 text-lg font-bold text-red-400 leading-none">
            {revenusImpayes.toFixed(3)} <span className="text-xs font-normal">TND</span>
          </p>
        </div>

        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('total')}</p>
          <p className="mt-1 text-lg font-bold text-blue-400 leading-none">
            {revenusTotal.toFixed(3)} <span className="text-xs font-normal">TND</span>
          </p>
        </div>
      </div>

      {/* Taux de paiement */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-medium text-muted-foreground">{t('paymentRate')}</span>
          <span className="font-semibold text-green-400">{tauxPaiement.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${tauxPaiement}%` }}
          />
        </div>
      </div>

      {/* Graphique simple des 3 derniers mois */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-3">{t('evolution3Months')}</p>
        <div className="flex items-end justify-between gap-2" style={{ height: '80px' }}>
          {derniersMois.map((mois) => (
            <div key={mois.mois} className="flex-1 flex flex-col items-center">
              <div className="w-full flex flex-col justify-end" style={{ height: '60px' }}>
                <div
                  className="w-full bg-blue-500/70 hover:bg-blue-500 rounded-t transition-all duration-200"
                  style={{ height: `${(mois.montant / maxMontant) * 100}%`, minHeight: mois.montant > 0 ? '4px' : '0' }}
                  title={`${mois.montant.toFixed(2)} TND`}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground text-center leading-tight">{mois.mois}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default memo(RevenusWidgetComponent)
