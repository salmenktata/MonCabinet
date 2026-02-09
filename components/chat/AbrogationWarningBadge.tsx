/**
 * Composant - Badge Warning Abrogations Juridiques
 *
 * Affiche les avertissements lorsque des lois ou articles abrogés sont détectés
 * dans une réponse RAG. Supporte 3 niveaux de sévérité avec couleurs distinctes.
 *
 * Fonctionnalités :
 * - Affichage multi-warnings (collapse/expand si >1)
 * - Messages bilingues FR/AR automatiques
 * - Icônes et couleurs selon severity (high=red, medium=orange, low=yellow)
 * - Accessibilité ARIA complète (role="alert", aria-live="polite")
 * - Data-testid pour tests E2E Playwright
 *
 * Usage :
 * ```tsx
 * <AbrogationWarningBadge warnings={response.abrogationWarnings} />
 * ```
 */

'use client'

import { useState } from 'react'
import { AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AbrogationWarning } from '@/lib/ai/abrogation-detector-service'

interface AbrogationWarningBadgeProps {
  warnings: AbrogationWarning[]
  language?: 'fr' | 'ar'
  className?: string
}

/**
 * Mapper severity → couleur Tailwind
 */
const SEVERITY_COLORS = {
  high: 'border-red-500 bg-red-50 dark:bg-red-950/20',
  medium: 'border-orange-500 bg-orange-50 dark:bg-orange-950/20',
  low: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20',
} as const

/**
 * Mapper severity → couleur texte
 */
const SEVERITY_TEXT_COLORS = {
  high: 'text-red-700 dark:text-red-400',
  medium: 'text-orange-700 dark:text-orange-400',
  low: 'text-yellow-700 dark:text-yellow-400',
} as const

/**
 * Mapper severity → icône émoji
 */
const SEVERITY_ICONS = {
  high: '🔴',
  medium: '🟡',
  low: '🟢',
} as const

/**
 * Mapper severity → label FR/AR
 */
const SEVERITY_LABELS = {
  fr: {
    high: 'CRITIQUE',
    medium: 'ATTENTION',
    low: 'INFORMATION',
  },
  ar: {
    high: 'حرج',
    medium: 'تحذير',
    low: 'معلومة',
  },
} as const

export function AbrogationWarningBadge({
  warnings,
  language = 'fr',
  className = '',
}: AbrogationWarningBadgeProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [isDismissed, setIsDismissed] = useState(false)

  // Pas de warnings → ne rien afficher
  if (!warnings || warnings.length === 0) {
    return null
  }

  // Warning dismissed → ne rien afficher
  if (isDismissed) {
    return null
  }

  const hasMultiple = warnings.length > 1

  return (
    <div
      data-testid="abrogation-warning"
      className={`my-4 ${className}`}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <Alert
        className={`border-l-4 ${SEVERITY_COLORS[warnings[0].severity]} relative`}
      >
        {/* Header avec icône + titre + bouton dismiss */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <AlertTriangle
              className={`h-5 w-5 mt-0.5 ${SEVERITY_TEXT_COLORS[warnings[0].severity]}`}
              aria-hidden="true"
            />

            <div className="flex-1 space-y-2">
              <AlertTitle className="text-base font-semibold mb-2">
                {language === 'ar' ? (
                  <>⚠️ قانون ملغى تم اكتشافه</>
                ) : (
                  <>⚠️ Loi abrogée détectée</>
                )}
                {hasMultiple && (
                  <Badge
                    variant="outline"
                    className="ml-2 text-xs"
                    aria-label={`${warnings.length} avertissements`}
                  >
                    {warnings.length}
                  </Badge>
                )}
              </AlertTitle>

              {/* Premier warning (toujours visible) */}
              <WarningItem
                warning={warnings[0]}
                language={language}
                index={1}
              />

              {/* Warnings additionnels (collapse/expand si >1) */}
              {hasMultiple && (
                <>
                  {isExpanded &&
                    warnings.slice(1).map((warning, idx) => (
                      <WarningItem
                        key={idx + 1}
                        warning={warning}
                        language={language}
                        index={idx + 2}
                      />
                    ))}

                  {/* Toggle expand/collapse */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="mt-2 text-sm"
                    aria-expanded={isExpanded}
                    aria-controls="additional-warnings"
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
                          ? `عرض ${warnings.length - 1} المزيد`
                          : `Afficher ${warnings.length - 1} de plus`}
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Bouton dismiss */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDismissed(true)}
            className="h-6 w-6 -mt-1 -mr-1 shrink-0"
            aria-label={language === 'ar' ? 'إغلاق' : 'Fermer'}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Alert>
    </div>
  )
}

/**
 * Composant Warning Item (affiche 1 warning)
 */
function WarningItem({
  warning,
  language,
  index,
}: {
  warning: AbrogationWarning
  language: 'fr' | 'ar'
  index: number
}) {
  const { reference, abrogationInfo, severity, message, messageAr } = warning

  const displayMessage = language === 'ar' ? messageAr : message
  const severityLabel = SEVERITY_LABELS[language][severity]
  const severityIcon = SEVERITY_ICONS[severity]

  return (
    <AlertDescription
      className={`text-sm ${SEVERITY_TEXT_COLORS[severity]} space-y-1.5`}
      data-testid="warning-item"
    >
      {/* Numéro + Severity badge */}
      <div className="flex items-center gap-2 font-medium">
        <span className="text-base">{index}.</span>
        <Badge
          variant="outline"
          className={`text-xs ${SEVERITY_TEXT_COLORS[severity]}`}
        >
          {severityIcon} {severityLabel}
        </Badge>
      </div>

      {/* Message principal */}
      <div className="pl-6" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <p className="font-medium">{displayMessage}</p>

        {/* Détails abrogation */}
        {abrogationInfo && (
          <div className="mt-2 space-y-1 text-xs opacity-90">
            {/* Articles affectés (si partial) */}
            {abrogationInfo.affectedArticles &&
              abrogationInfo.affectedArticles.length > 0 && (
                <p>
                  {language === 'ar' ? '📋 المواد المتضررة: ' : '📋 Articles concernés : '}
                  <span className="font-mono">
                    {abrogationInfo.affectedArticles.join(', ')}
                  </span>
                </p>
              )}

            {/* Notes */}
            {abrogationInfo.notes && (
              <p>
                {language === 'ar' ? '💡 ملاحظة: ' : '💡 Note : '}
                {abrogationInfo.notes}
              </p>
            )}

            {/* Lien source (si disponible) */}
            {abrogationInfo.sourceUrl && (
              <p>
                <a
                  href={abrogationInfo.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:no-underline"
                >
                  🔗 {language === 'ar' ? 'رابط المصدر' : 'Voir la source'}
                </a>
              </p>
            )}

            {/* Similarité (debug mode) */}
            {abrogationInfo.similarityScore &&
              abrogationInfo.similarityScore < 1 && (
                <p className="opacity-60">
                  {language === 'ar' ? '🔍 التشابه: ' : '🔍 Similarité : '}
                  {Math.round(abrogationInfo.similarityScore * 100)}%
                </p>
              )}
          </div>
        )}
      </div>
    </AlertDescription>
  )
}

export default AbrogationWarningBadge
