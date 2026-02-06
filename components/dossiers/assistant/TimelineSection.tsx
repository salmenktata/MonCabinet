'use client'

import { useTranslations } from 'next-intl'
import type { TimelineStep } from '@/lib/ai/dossier-structuring-service'

interface TimelineSectionProps {
  timeline: TimelineStep[]
}

export default function TimelineSection({ timeline }: TimelineSectionProps) {
  const t = useTranslations('assistant')

  if (timeline.length === 0) return null

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">&#128197;</span>
        <h3 className="text-lg font-semibold text-foreground">
          {t('timeline.title')}
        </h3>
      </div>

      <div className="relative">
        {/* Ligne verticale */}
        <div className="absolute left-4 top-0 h-full w-0.5 bg-muted" />

        <div className="space-y-4">
          {timeline.map((step, index) => {
            const isFirst = index === 0
            const dateStr = step.dateEstimee
              ? new Date(step.dateEstimee).toLocaleDateString('fr-TN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : ''

            return (
              <div key={index} className="relative flex gap-4 pl-8">
                {/* Point sur la timeline */}
                <div
                  className={`absolute left-2 top-1 h-5 w-5 rounded-full border-2 ${
                    isFirst
                      ? 'border-blue-600 bg-blue-600'
                      : step.obligatoire
                        ? 'border-amber-500 bg-amber-500'
                        : 'border-gray-300 bg-white'
                  }`}
                >
                  {isFirst && (
                    <div className="absolute inset-0 animate-ping rounded-full bg-blue-600 opacity-25" />
                  )}
                </div>

                {/* Contenu */}
                <div
                  className={`flex-1 rounded-lg border p-3 ${
                    isFirst
                      ? 'border-blue-200 bg-blue-50'
                      : 'border-muted bg-muted/30'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-foreground">
                        {step.etape}
                      </h4>
                      {step.obligatoire && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          {t('timeline.mandatory')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>
                        {isFirst ? t('timeline.today') : `J+${step.delaiJours}`}
                      </span>
                      <span className="font-medium text-foreground">
                        {dateStr}
                      </span>
                    </div>
                  </div>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {step.description}
                  </p>

                  {step.alertes && step.alertes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {step.alertes.map((alerte, alerteIndex) => (
                        <span
                          key={alerteIndex}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                        >
                          <span>&#9888;</span>
                          {alerte}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Fin de procédure */}
          <div className="relative flex gap-4 pl-8">
            <div className="absolute left-2 top-1 h-5 w-5 rounded-full border-2 border-green-500 bg-green-500">
              <svg
                className="h-full w-full text-white p-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div className="flex-1 rounded-lg border border-green-200 bg-green-50 p-3">
              <span className="font-semibold text-green-800">
                {t('timeline.endProcedure')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
