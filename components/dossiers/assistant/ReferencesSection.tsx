'use client'

import { useTranslations } from 'next-intl'
import type { LegalReference } from '@/lib/ai/dossier-structuring-service'

interface ReferencesSectionProps {
  references: LegalReference[]
}

const TYPE_CONFIG: Record<
  LegalReference['type'],
  { icon: string; colorClass: string; labelKey: string }
> = {
  code: {
    icon: '&#128214;',
    colorClass: 'border-blue-200 bg-blue-50',
    labelKey: 'references.code',
  },
  jurisprudence: {
    icon: '&#9878;',
    colorClass: 'border-amber-200 bg-amber-50',
    labelKey: 'references.jurisprudence',
  },
  doctrine: {
    icon: '&#128218;',
    colorClass: 'border-purple-200 bg-purple-50',
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
            colorClass: 'border-gray-200 bg-gray-50',
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
                    className={`rounded-lg border p-3 ${config.colorClass}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-medium text-foreground">
                          {ref.titre}
                        </span>
                        {ref.article && (
                          <span className="ml-2 text-sm text-muted-foreground">
                            ({ref.article})
                          </span>
                        )}
                      </div>
                      {ref.pertinence > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {ref.pertinence}% pertinent
                        </span>
                      )}
                    </div>
                    {ref.extrait && (
                      <p className="mt-2 text-sm text-muted-foreground italic border-l-2 border-current/20 pl-3">
                        "{ref.extrait}"
                      </p>
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
