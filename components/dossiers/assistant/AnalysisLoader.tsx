'use client'

import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'

interface AnalysisLoaderProps {
  completedSteps: string[]
}

export default function AnalysisLoader({ completedSteps }: AnalysisLoaderProps) {
  const t = useTranslations('assistant')

  const allSteps = [
    t('analysis.identifyingType'),
    t('analysis.extractingParties'),
    t('analysis.extractingFacts'),
    t('analysis.legalCalculations'),
    t('analysis.generatingTimeline'),
    t('analysis.searchingReferences'),
  ]

  return (
    <div className="rounded-xl border bg-card p-8 shadow-sm">
      <div className="flex flex-col items-center justify-center space-y-8">
        {/* Spinner */}
        <div className="relative">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-amber-200 dark:border-amber-800 border-t-amber-600" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl">&#129302;</span>
          </div>
        </div>

        <div className="text-center space-y-1">
          <h2 className="text-xl font-semibold text-foreground">{t('analysis.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {completedSteps.length < allSteps.length
              ? allSteps[completedSteps.length] ?? ''
              : t('analysis.finalizing') || 'Finalisation…'}
          </p>
        </div>

        {/* Étapes */}
        <div className="w-full max-w-sm space-y-2">
          {allSteps.map((step, index) => {
            const isCompleted = completedSteps.includes(step)
            const isActive = index === completedSteps.length && index < allSteps.length
            const isPending = index > completedSteps.length

            return (
              <div
                key={index}
                className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-all duration-300 ${
                  isCompleted
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                    : isActive
                      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                      : 'text-muted-foreground'
                }`}
              >
                <span className="shrink-0">
                  {isCompleted ? (
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : isActive ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/20" />
                  )}
                </span>
                <span className={isPending ? 'opacity-40' : ''}>{step}</span>
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-sm">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-500"
              style={{ width: `${(completedSteps.length / allSteps.length) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-center text-xs text-muted-foreground tabular-nums">
            {completedSteps.length} / {allSteps.length}
          </p>
        </div>
      </div>
    </div>
  )
}
