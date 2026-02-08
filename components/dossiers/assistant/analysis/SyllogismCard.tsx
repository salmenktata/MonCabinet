'use client'

import type { LegalAnalysis } from '@/lib/ai/dossier-structuring-service'

interface SyllogismCardProps {
  syllogisme: LegalAnalysis['syllogisme']
}

export default function SyllogismCard({ syllogisme }: SyllogismCardProps) {
  return (
    <div className="rounded-lg border-2 border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">&#128161;</span>
        <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-200">
          Syllogisme Juridique
        </h3>
        <span className="text-sm text-indigo-600 dark:text-indigo-400" dir="rtl">
          (القياس القانوني)
        </span>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg bg-white/60 dark:bg-white/5 p-4 border-l-4 border-indigo-500">
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase">Majeure (La règle de droit)</span>
          <p className="mt-1 text-indigo-900 dark:text-indigo-200">{syllogisme.majeure}</p>
        </div>
        <div className="rounded-lg bg-white/60 dark:bg-white/5 p-4 border-l-4 border-purple-500">
          <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase">Mineure (Les faits qualifiés)</span>
          <p className="mt-1 text-purple-900 dark:text-purple-200">{syllogisme.mineure}</p>
        </div>
        <div className="rounded-lg bg-white/60 dark:bg-white/5 p-4 border-l-4 border-blue-500">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Conclusion (La demande)</span>
          <p className="mt-1 text-blue-900 dark:text-blue-200 font-medium">{syllogisme.conclusion}</p>
        </div>
      </div>
    </div>
  )
}
