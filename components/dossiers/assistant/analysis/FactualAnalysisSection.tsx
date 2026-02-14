'use client'

import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import type { AnalyseFaits } from '@/lib/ai/dossier-structuring-service'
import { formatReadingTime } from '@/lib/utils/reading-time'

interface FactualAnalysisSectionProps {
  analyseFaits: AnalyseFaits
  readingTime: number
}

export default function FactualAnalysisSection({ analyseFaits, readingTime }: FactualAnalysisSectionProps) {
  const t = useTranslations('assistant')
  const locale = useLocale()

  return (
    <div className="rounded-lg border-2 border-cyan-200 dark:border-cyan-800 bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">&#128200;</span>
        <h3 className="text-lg font-semibold text-cyan-900 dark:text-cyan-200">
          {t('legalAnalysis.analyseFaits.title')}
        </h3>
        <span className="text-sm text-cyan-600 dark:text-cyan-400" dir="rtl">
          (التحليل الوقائعي)
        </span>
        <span className="ml-auto text-xs text-cyan-700 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-900/30 px-2 py-1 rounded-full">
          ⏱ {formatReadingTime(readingTime, locale)}
        </span>
      </div>

      <div className="space-y-4">
        {/* Nœuds Décisifs */}
        {analyseFaits.noeudsDecisifs && analyseFaits.noeudsDecisifs.length > 0 && (
          <div className="rounded-lg bg-white/60 dark:bg-white/5 p-4">
            <h4 className="font-medium text-cyan-900 dark:text-cyan-200 mb-3 flex items-center gap-2">
              <span>&#11088;</span>
              {t('legalAnalysis.analyseFaits.decisiveNodes')}
            </h4>
            <div className="space-y-3">
              {analyseFaits.noeudsDecisifs.map((node, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-3 border ${
                    node.importance === 'critique'
                      ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
                      : node.importance === 'important'
                      ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-border dark:border-gray-700 bg-muted dark:bg-gray-900/20'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${
                          node.importance === 'critique'
                            ? 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200'
                            : node.importance === 'important'
                            ? 'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200'
                            : 'bg-gray-200 dark:bg-gray-800 text-foreground dark:text-gray-200'
                        }`}>
                          {node.importance === 'critique' ? t('legalAnalysis.analyseFaits.critical') : node.importance === 'important' ? t('legalAnalysis.analyseFaits.important') : t('legalAnalysis.analyseFaits.secondary')}
                        </span>
                      </div>
                      <p className="mt-2 font-medium">{node.point}</p>
                      <div className="mt-2 grid gap-2 md:grid-cols-2 text-sm">
                        <div>
                          <span className="text-green-600 dark:text-green-400">{t('legalAnalysis.analyseFaits.currentProof')}:</span>
                          <span className="ml-1">{node.preuveActuelle || t('legalAnalysis.analyseFaits.none')}</span>
                        </div>
                        <div>
                          <span className="text-amber-600 dark:text-amber-400">{t('legalAnalysis.analyseFaits.missingProof')}:</span>
                          <span className="ml-1">{node.preuveManquante || t('legalAnalysis.analyseFaits.none')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Acteurs */}
        {analyseFaits.acteurs && analyseFaits.acteurs.length > 0 && (
          <div className="rounded-lg bg-white/60 dark:bg-white/5 p-4">
            <h4 className="font-medium text-cyan-900 dark:text-cyan-200 mb-3 flex items-center gap-2">
              <span>&#128101;</span>
              {t('legalAnalysis.analyseFaits.actors')}
            </h4>
            <div className="flex flex-wrap gap-2">
              {analyseFaits.acteurs.map((actor, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-3 py-2 border ${
                    actor.interet === 'favorable'
                      ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
                      : actor.interet === 'defavorable'
                      ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
                      : 'border-border dark:border-gray-700 bg-muted dark:bg-gray-900/20'
                  }`}
                >
                  <div className="font-medium text-sm">{actor.nom}</div>
                  <div className="text-xs text-muted-foreground">{actor.role}</div>
                  <div className="mt-1 flex items-center gap-1">
                    <span className={`text-xs ${
                      actor.interet === 'favorable' ? 'text-green-600' : actor.interet === 'defavorable' ? 'text-red-600' : 'text-muted-foreground'
                    }`}>
                      {actor.interet === 'favorable' ? '&#128994;' : actor.interet === 'defavorable' ? '&#128308;' : '&#128993;'}
                    </span>
                    <span className="text-xs text-muted-foreground">{actor.fiabilite}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chronologie */}
        {analyseFaits.chronologie && analyseFaits.chronologie.length > 0 && (
          <div className="rounded-lg bg-white/60 dark:bg-white/5 p-4">
            <h4 className="font-medium text-cyan-900 dark:text-cyan-200 mb-3 flex items-center gap-2">
              <span>&#128197;</span>
              {t('legalAnalysis.analyseFaits.chronology')}
            </h4>
            <div className="space-y-2">
              {analyseFaits.chronologie.slice(0, 5).map((event, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className="font-mono text-xs text-cyan-600 dark:text-cyan-400 whitespace-nowrap">{event.date}</span>
                  <span className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${
                    event.importance === 'decisif' ? 'bg-red-500' : event.importance === 'important' ? 'bg-amber-500' : 'bg-gray-400'
                  }`} />
                  <span>{event.evenement}</span>
                  {event.preuve && (
                    <span className="text-xs text-green-600 dark:text-green-400 ml-auto">&#128196; {event.preuve}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
