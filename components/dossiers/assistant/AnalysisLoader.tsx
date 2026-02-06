'use client'

import { useTranslations } from 'next-intl'

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
    <div className="rounded-lg border bg-card p-8 shadow-sm">
      <div className="flex flex-col items-center justify-center space-y-6">
        {/* Spinner */}
        <div className="relative">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl">&#129302;</span>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-foreground">{t('analysis.title')}</h2>

        {/* Étapes */}
        <div className="w-full max-w-md space-y-3">
          {allSteps.map((step, index) => {
            const isCompleted = completedSteps.includes(step)
            const isActive =
              index === completedSteps.length && index < allSteps.length
            const isPending = index > completedSteps.length

            return (
              <div
                key={index}
                className={`flex items-center gap-3 rounded-lg px-4 py-2 transition-all duration-300 ${
                  isCompleted
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                    : isActive
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300'
                      : 'bg-muted/50 text-muted-foreground'
                }`}
              >
                {isCompleted ? (
                  <svg
                    className="h-5 w-5 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : isActive ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                )}
                <span className={`text-sm ${isPending ? 'opacity-50' : ''}`}>
                  {step}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
