'use client'

import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import type { Diagnostic } from '@/lib/ai/dossier-structuring-service'
import { formatReadingTime } from '@/lib/utils/reading-time'

interface DiagnosticSectionProps {
  diagnostic: Diagnostic
  readingTime: number
}

export default function DiagnosticSection({ diagnostic, readingTime }: DiagnosticSectionProps) {
  const t = useTranslations('assistant')
  const locale = useLocale()

  return (
    <div className="rounded-lg border-2 border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">&#128269;</span>
        <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-200">
          {t('legalAnalysis.diagnostic.title')}
        </h3>
        <span className="text-sm text-amber-600 dark:text-amber-400" dir="rtl">
          (التشخيص الأولي)
        </span>
        <span className="ml-auto text-xs text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-full">
          ⏱ {formatReadingTime(readingTime, locale)}
        </span>
      </div>

      <div className="space-y-4">
        {/* Objectif Client */}
        {diagnostic.objectifClient && (
          <div className="rounded-lg bg-white/60 dark:bg-white/5 p-4">
            <h4 className="font-medium text-amber-900 dark:text-amber-200 mb-3 flex items-center gap-2">
              <span>&#127919;</span>
              {t('legalAnalysis.diagnostic.clientObjective')}
            </h4>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
                <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase">{t('legalAnalysis.diagnostic.principal')}</span>
                <p className="mt-1 text-green-900 dark:text-green-200 text-sm">{diagnostic.objectifClient.principal}</p>
              </div>
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">{t('legalAnalysis.diagnostic.secondary')}</span>
                <ul className="mt-1 text-blue-900 dark:text-blue-200 text-sm list-disc list-inside">
                  {diagnostic.objectifClient.secondaires.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase">{t('legalAnalysis.diagnostic.redLine')}</span>
                <p className="mt-1 text-red-900 dark:text-red-200 text-sm">{diagnostic.objectifClient.ligneRouge}</p>
              </div>
            </div>
          </div>
        )}

        {/* Séparation Faits / Interprétations / Ressentis */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Faits Juridiques */}
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
            <h4 className="font-medium text-green-900 dark:text-green-200 mb-2 flex items-center gap-2">
              <span>&#9989;</span>
              {t('legalAnalysis.diagnostic.legalFacts')}
            </h4>
            <p className="text-xs text-green-700 dark:text-green-400 mb-2">{t('legalAnalysis.diagnostic.legalFactsDesc')}</p>
            <ul className="space-y-1">
              {diagnostic.faitsJuridiques?.slice(0, 5).map((fact, i) => (
                <li key={i} className="text-sm text-green-800 dark:text-green-300 flex items-start gap-1">
                  <span className="text-green-600">•</span>
                  <span>{fact.label}: {fact.valeur}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Interprétations */}
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
            <h4 className="font-medium text-amber-900 dark:text-amber-200 mb-2 flex items-center gap-2">
              <span>&#128161;</span>
              {t('legalAnalysis.diagnostic.interpretations')}
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">{t('legalAnalysis.diagnostic.interpretationsDesc')}</p>
            <ul className="space-y-1">
              {diagnostic.interpretations?.map((interp, i) => (
                <li key={i} className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-1">
                  <span className="text-amber-600">?</span>
                  <span>{interp}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Ressentis */}
          <div className="rounded-lg bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 p-4">
            <h4 className="font-medium text-gray-900 dark:text-gray-200 mb-2 flex items-center gap-2">
              <span>&#128167;</span>
              {t('legalAnalysis.diagnostic.feelings')}
            </h4>
            <p className="text-xs text-gray-700 dark:text-gray-400 mb-2">{t('legalAnalysis.diagnostic.feelingsDesc')}</p>
            <ul className="space-y-1">
              {diagnostic.ressentis?.map((ressenti, i) => (
                <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-1 line-through opacity-70">
                  <span>~</span>
                  <span>{ressenti}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Champs Juridiques */}
        {diagnostic.champsJuridiques && (
          <div className="rounded-lg bg-white/60 dark:bg-white/5 p-4">
            <h4 className="font-medium text-amber-900 dark:text-amber-200 mb-2">
              {t('legalAnalysis.diagnostic.legalFields')}
            </h4>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-amber-200 dark:bg-amber-800 px-3 py-1 text-sm font-medium text-amber-800 dark:text-amber-200">
                {diagnostic.champsJuridiques.principal}
              </span>
              {diagnostic.champsJuridiques.satellites?.map((sat, i) => (
                <span key={i} className="rounded-full bg-amber-100 dark:bg-amber-900/50 px-3 py-1 text-sm text-amber-700 dark:text-amber-300">
                  {sat}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
