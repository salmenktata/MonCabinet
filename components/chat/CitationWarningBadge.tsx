/**
 * Composant - Badge Warning Citations Non Vérifiées
 *
 * Affiche les avertissements lorsque des citations juridiques (articles, lois)
 * ne peuvent pas être vérifiées dans les sources fournies par le RAG.
 *
 * Fonctionnalités :
 * - Liste citations non vérifiées avec détails
 * - Collapse/expand si >3 citations
 * - Messages bilingues FR/AR
 * - Accessibilité ARIA complète
 * - Data-testid pour tests E2E
 *
 * Usage :
 * ```tsx
 * <CitationWarningBadge warnings={response.citationWarnings} />
 * ```
 */

'use client'

import { useState } from 'react'
import { AlertCircle, X, ChevronDown, ChevronUp, BookOpen } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface CitationWarningBadgeProps {
  warnings: string[]
  language?: 'fr' | 'ar'
  className?: string
}

/**
 * Seuil d'affichage avant collapse
 */
const COLLAPSE_THRESHOLD = 3

export function CitationWarningBadge({
  warnings,
  language = 'fr',
  className = '',
}: CitationWarningBadgeProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  // Pas de warnings → ne rien afficher
  if (!warnings || warnings.length === 0) {
    return null
  }

  // Warning dismissed → ne rien afficher
  if (isDismissed) {
    return null
  }

  const hasMany = warnings.length > COLLAPSE_THRESHOLD
  const visibleWarnings = isExpanded
    ? warnings
    : warnings.slice(0, COLLAPSE_THRESHOLD)
  const hiddenCount = warnings.length - COLLAPSE_THRESHOLD

  return (
    <div
      data-testid="citation-warning"
      className={`my-4 ${className}`}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <Alert className="border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/20 relative">
        {/* Header avec icône + titre + bouton dismiss */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <AlertCircle
              className="h-5 w-5 mt-0.5 text-amber-700 dark:text-amber-400"
              aria-hidden="true"
            />

            <div className="flex-1 space-y-2">
              <AlertTitle className="text-base font-semibold mb-2 text-amber-900 dark:text-amber-300">
                {language === 'ar' ? (
                  <>⚠️ استشهادات غير موثقة</>
                ) : (
                  <>⚠️ Citations non vérifiées</>
                )}
                <Badge
                  variant="outline"
                  className="ml-2 text-xs border-amber-600 text-amber-700 dark:text-amber-400"
                  aria-label={`${warnings.length} citations`}
                >
                  {warnings.length}
                </Badge>
              </AlertTitle>

              <AlertDescription className="text-sm text-amber-800 dark:text-amber-300 space-y-2">
                {/* Message explicatif */}
                <p className="font-medium" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                  {language === 'ar' ? (
                    <>
                      الاستشهادات التالية لم يتم العثور عليها في المصادر المقدمة.
                      يرجى التحقق منها بشكل مستقل:
                    </>
                  ) : (
                    <>
                      Les citations suivantes n'ont pas pu être vérifiées dans les
                      sources fournies. Veuillez les vérifier de manière indépendante :
                    </>
                  )}
                </p>

                {/* Liste citations */}
                <ul className="space-y-1.5 pl-4">
                  {visibleWarnings.map((citation, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-sm"
                      data-testid="citation-item"
                    >
                      <BookOpen className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
                      <span className="font-mono text-amber-900 dark:text-amber-200">
                        {citation}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Toggle expand/collapse si >COLLAPSE_THRESHOLD */}
                {hasMany && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="mt-2 text-sm text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                    aria-expanded={isExpanded}
                    aria-controls="additional-citations"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-4 w-4 mr-1" />
                        {language === 'ar' ? 'إخفاء' : 'Réduire'}
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4 mr-1" />
                        {language === 'ar'
                          ? `عرض ${hiddenCount} المزيد`
                          : `Afficher ${hiddenCount} de plus`}
                      </>
                    )}
                  </Button>
                )}

                {/* Message de conseil */}
                <p className="text-xs opacity-80 pt-2 border-t border-amber-300 dark:border-amber-700">
                  {language === 'ar' ? (
                    <>
                      💡 <strong>نصيحة:</strong> يمكن أن تكون هذه الاستشهادات صحيحة ولكن
                      غير موجودة في قاعدة البيانات الحالية. تحقق من المصادر الرسمية.
                    </>
                  ) : (
                    <>
                      💡 <strong>Conseil :</strong> Ces citations peuvent être correctes
                      mais absentes de la base de données actuelle. Vérifiez les sources
                      officielles.
                    </>
                  )}
                </p>
              </AlertDescription>
            </div>
          </div>

          {/* Bouton dismiss */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDismissed(true)}
            className="h-6 w-6 -mt-1 -mr-1 shrink-0 text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
            aria-label={language === 'ar' ? 'إغلاق' : 'Fermer'}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Alert>
    </div>
  )
}

export default CitationWarningBadge
