'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

interface TimeTrackingWidgetProps {
  timeEntries: any[]
}

export default function TimeTrackingWidget({ timeEntries }: TimeTrackingWidgetProps) {
  const t = useTranslations('widgets.timeTracking')
  const tCurrency = useTranslations('currency')

  // Mémoiser tous les calculs coûteux
  const { entriesCeMois, tempsTotal, revenusTotal, heuresTotal, minutesTotal, tauxMoyen } = useMemo(() => {
    const maintenant = new Date()
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1)

    const filteredEntries = timeEntries.filter((e) => {
      const dateEntree = new Date(e.date)
      return dateEntree >= debutMois
    })

    const temps = filteredEntries.reduce((acc, e) => acc + (e.duree_minutes || 0), 0)
    const revenus = filteredEntries.reduce(
      (acc, e) => acc + parseFloat(e.montant_calcule || 0),
      0
    )

    return {
      entriesCeMois: filteredEntries,
      tempsTotal: temps,
      revenusTotal: revenus,
      heuresTotal: Math.floor(temps / 60),
      minutesTotal: temps % 60,
      tauxMoyen: temps > 0 ? (revenus / (temps / 60)).toFixed(2) : '0.00'
    }
  }, [timeEntries])

  // Temps par semaine (4 dernières semaines) - mémorisé
  const { semaines, maxHeures } = useMemo(() => {
    const weeks = Array.from({ length: 4 }, (_, i) => {
      const debut = new Date()
      debut.setDate(debut.getDate() - (i + 1) * 7)
      debut.setHours(0, 0, 0, 0)

      const fin = new Date()
      fin.setDate(fin.getDate() - i * 7)
      fin.setHours(23, 59, 59, 999)

      const entresSemaine = timeEntries.filter((e) => {
        const dateEntree = new Date(e.date)
        return dateEntree >= debut && dateEntree <= fin
      })

      const minutes = entresSemaine.reduce((acc, e) => acc + (e.duree_minutes || 0), 0)

      return {
        label: `S${i + 1}`,
        heures: Math.round(minutes / 60),
      }
    }).reverse()

    return {
      semaines: weeks,
      maxHeures: Math.max(...weeks.map((s) => s.heures), 1)
    }
  }, [timeEntries])

  return (
    <div className="rounded-xl border bg-card/50 backdrop-blur-sm p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">{t('title')}</h2>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('timeThisMonth')}</p>
          <p className="mt-1 text-xl font-bold text-blue-400 leading-none">
            {heuresTotal}<span className="text-sm font-normal">h</span>
            {minutesTotal > 0 && <span className="text-sm font-normal">{minutesTotal}m</span>}
          </p>
        </div>

        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('revenueGenerated')}</p>
          <p className="mt-1 text-lg font-bold text-green-400 leading-none">
            {revenusTotal.toFixed(2)} <span className="text-xs font-normal">{tCurrency('tnd')}</span>
          </p>
        </div>

        <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('averageHourlyRate')}</p>
          <p className="mt-1 text-lg font-bold text-purple-400 leading-none">
            {tauxMoyen} <span className="text-xs font-normal">{tCurrency('tnd')}/h</span>
          </p>
        </div>
      </div>

      {/* Graphique 4 dernières semaines */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-3">{t('hoursPerWeek')}</p>
        <div className="flex items-end justify-between gap-2" style={{ height: '72px' }}>
          {semaines.map((semaine, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div className="w-full flex flex-col justify-end" style={{ height: '48px' }}>
                <div
                  className="w-full bg-blue-500/70 hover:bg-blue-500 rounded-t transition-all duration-200"
                  style={{ height: `${(semaine.heures / maxHeures) * 100}%`, minHeight: semaine.heures > 0 ? '4px' : '0' }}
                  title={`${semaine.heures}h`}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{semaine.label}</p>
              <p className="text-[10px] font-medium text-foreground">{semaine.heures}h</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
