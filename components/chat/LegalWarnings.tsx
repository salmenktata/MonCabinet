/**
 * Composant - Legal Warnings (Wrapper)
 *
 * Composant wrapper qui affiche tous les warnings de validation juridique :
 * 1. Citations non vérifiées (Phase 2.2)
 * 2. Lois/articles abrogés (Phase 2.3)
 *
 * Détecte automatiquement la langue du message et affiche les warnings
 * dans la langue appropriée (FR/AR).
 *
 * Usage :
 * ```tsx
 * <LegalWarnings
 *   citationWarnings={response.citationWarnings}
 *   abrogationWarnings={response.abrogationWarnings}
 *   messageText={response.answer}
 * />
 * ```
 */

'use client'

import { useMemo } from 'react'
import { CitationWarningBadge } from './CitationWarningBadge'
import { AbrogationWarningBadge } from './AbrogationWarningBadge'
import type { AbrogationWarning } from '@/lib/ai/abrogation-detector-service'

interface LegalWarningsProps {
  citationWarnings?: string[]
  abrogationWarnings?: AbrogationWarning[]
  messageText?: string
  className?: string
}

/**
 * Détecte la langue d'un texte (FR vs AR)
 * Basé sur la présence de caractères arabes
 */
function detectLanguage(text: string): 'fr' | 'ar' {
  if (!text) return 'fr'

  // Regex caractères arabes Unicode
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/

  // Si >20% caractères arabes → langue arabe
  const arabicChars = text.match(arabicRegex)
  const totalChars = text.replace(/\s/g, '').length

  if (arabicChars && totalChars > 0) {
    const arabicRatio = arabicChars.length / totalChars
    return arabicRatio > 0.2 ? 'ar' : 'fr'
  }

  return 'fr'
}

export function LegalWarnings({
  citationWarnings,
  abrogationWarnings,
  messageText = '',
  className = '',
}: LegalWarningsProps) {
  // Détection automatique de la langue
  const language = useMemo(
    () => detectLanguage(messageText),
    [messageText]
  )

  const hasCitationWarnings =
    citationWarnings && citationWarnings.length > 0
  const hasAbrogationWarnings =
    abrogationWarnings && abrogationWarnings.length > 0

  // Pas de warnings → ne rien afficher
  if (!hasCitationWarnings && !hasAbrogationWarnings) {
    return null
  }

  return (
    <div className={`space-y-3 ${className}`} data-testid="legal-warnings">
      {/* Warnings Abrogations (afficher en premier = plus critique) */}
      {hasAbrogationWarnings && (
        <AbrogationWarningBadge
          warnings={abrogationWarnings}
          language={language}
        />
      )}

      {/* Warnings Citations */}
      {hasCitationWarnings && (
        <CitationWarningBadge
          warnings={citationWarnings}
          language={language}
        />
      )}
    </div>
  )
}

export default LegalWarnings
