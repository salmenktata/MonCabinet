'use client'

import { useTranslations } from 'next-intl'
import type { LegalReference } from '@/lib/ai/dossier-structuring-service'
import SourceFeedback from './SourceFeedback'

interface ReferencesSectionProps {
  references: LegalReference[]
}

const TYPE_CONFIG: Record<
  LegalReference['type'],
  { icon: string; colorClass: string; labelKey: string }
> = {
  code: {
    icon: '&#128214;',
    colorClass: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20',
    labelKey: 'references.code',
  },
  jurisprudence: {
    icon: '&#9878;',
    colorClass: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20',
    labelKey: 'references.jurisprudence',
  },
  doctrine: {
    icon: '&#128218;',
    colorClass: 'border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20',
    labelKey: 'references.doctrine',
  },
}

export default function ReferencesSection({
  references,
}: ReferencesSectionProps) {
  const t = useTranslations('assistant')

  if (references.length === 0) return null

  // Grouper par type
  const grouped = references.reduce(
    (acc, ref) => {
      if (!acc[ref.type]) acc[ref.type] = []
      acc[ref.type].push(ref)
      return acc
    },
    {} as Record<string, LegalReference[]>
  )

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">&#128218;</span>
        <h3 className="text-lg font-semibold text-foreground">
          {t('references.title')}
        </h3>
      </div>

      <div className="space-y-4">
        {Object.entries(grouped).map(([type, refs]) => {
          const config = TYPE_CONFIG[type as LegalReference['type']] || {
            icon: '&#128196;',
            colorClass: 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50',
            labelKey: 'references.other',
          }

          return (
            <div key={type}>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
                <span dangerouslySetInnerHTML={{ __html: config.icon }} />
                {t(config.labelKey)}
              </h4>

              <div className="space-y-2">
                {refs.map((ref, index) => (
                  <div
                    key={index}
                    className={`rounded-lg border p-3 ${config.colorClass} transition-all hover:shadow-md`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground">
                            {ref.titre}
                          </span>
                          {ref.article && (
                            <span className="text-sm text-muted-foreground">
                              ({ref.article})
                            </span>
                          )}
                          {/* Badge de pertinence coloré */}
                          {ref.pertinence > 0 && (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                ref.pertinence >= 90
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  : ref.pertinence >= 70
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                              }`}
                            >
                              {ref.pertinence >= 90 ? '★' : ref.pertinence >= 70 ? '●' : '○'} {ref.pertinence}%
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Actions rapides */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigator.clipboard.writeText(ref.extrait || ref.titre)}
                          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                          title="Copier"
                        >
                          <span className="text-sm">📋</span>
                        </button>
                        {/* Feedback */}
                        <SourceFeedback
                          sourceId={`${ref.type}-${ref.titre.replace(/\s+/g, '-').toLowerCase()}`}
                          sourceTitre={ref.titre}
                        />
                      </div>
                    </div>
                    {ref.extrait && (
                      <p className="mt-2 text-sm text-muted-foreground italic border-l-2 border-current/20 pl-3">
                        "{ref.extrait}"
                      </p>
                    )}
                    {/* Métadonnées étendues */}
                    {ref.metadata && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {ref.metadata.source && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                            📍 {ref.metadata.source}
                          </span>
                        )}
                        {ref.metadata.date && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                            📅 {ref.metadata.date}
                          </span>
                        )}
                        {ref.metadata.juridiction && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                            ⚖️ {ref.metadata.juridiction}
                          </span>
                        )}
                        {ref.metadata.chunkPosition !== undefined && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                            🔢 Chunk {ref.metadata.chunkPosition}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
