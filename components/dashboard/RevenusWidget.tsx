'use client'

import { useTranslations } from 'next-intl'

interface RevenusWidgetProps {
  factures: any[]
}

export default function RevenusWidget({ factures }: RevenusWidgetProps) {
  const t = useTranslations('dashboard.revenue')

  // Calcul des revenus
  const revenusTotal = factures.reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0)
  const revenusPayes = factures
    .filter((f) => f.statut === 'PAYEE')
    .reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0)
  const revenusEnAttente = factures
    .filter((f) => f.statut === 'ENVOYEE')
    .reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0)
  const revenusImpayes = factures
    .filter((f) => f.statut === 'IMPAYEE')
    .reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0)

  const tauxPaiement = revenusTotal > 0 ? (revenusPayes / revenusTotal) * 100 : 0

  // Calcul des revenus par mois (3 derniers mois)
  const derniersMois = Array.from({ length: 3 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    return {
      mois: d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
      montant: 0,
    }
  }).reverse()

  factures.forEach((f) => {
    const dateFacture = new Date(f.date_emission)
    const moisFacture = dateFacture.toLocaleDateString('fr-FR', {
      month: 'short',
      year: 'numeric',
    })
    const mois = derniersMois.find((m) => m.mois === moisFacture)
    if (mois) {
      mois.montant += parseFloat(f.montant_ttc || 0)
    }
  })

  const maxMontant = Math.max(...derniersMois.map((m) => m.montant), 1)

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('title')}</h2>

      {/* Statistiques principales */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg bg-green-50 p-4">
          <p className="text-xs font-medium text-green-600">{t('paid')}</p>
          <p className="mt-1 text-2xl font-bold text-green-700">
            {revenusPayes.toFixed(3)} <span className="text-sm">TND</span>
          </p>
        </div>

        <div className="rounded-lg bg-orange-50 p-4">
          <p className="text-xs font-medium text-orange-600">{t('pending')}</p>
          <p className="mt-1 text-2xl font-bold text-orange-700">
            {revenusEnAttente.toFixed(3)} <span className="text-sm">TND</span>
          </p>
        </div>

        <div className="rounded-lg bg-red-50 p-4">
          <p className="text-xs font-medium text-red-600">{t('unpaid')}</p>
          <p className="mt-1 text-2xl font-bold text-red-700">
            {revenusImpayes.toFixed(3)} <span className="text-sm">TND</span>
          </p>
        </div>

        <div className="rounded-lg bg-blue-50 p-4">
          <p className="text-xs font-medium text-blue-600">{t('total')}</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">
            {revenusTotal.toFixed(3)} <span className="text-sm">TND</span>
          </p>
        </div>
      </div>

      {/* Taux de paiement */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium text-gray-700">{t('paymentRate')}</span>
          <span className="font-semibold text-green-600">{tauxPaiement.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${tauxPaiement}%` }}
          />
        </div>
      </div>

      {/* Graphique simple des 3 derniers mois */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">{t('evolution3Months')}</p>
        <div className="flex items-end justify-between gap-2" style={{ height: '100px' }}>
          {derniersMois.map((mois) => (
            <div key={mois.mois} className="flex-1 flex flex-col items-center">
              <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                <div
                  className="w-full bg-blue-500 rounded-t transition-all duration-300 hover:bg-blue-600"
                  style={{ height: `${(mois.montant / maxMontant) * 100}%` }}
                  title={`${mois.montant.toFixed(2)} TND`}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500 text-center">{mois.mois}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
