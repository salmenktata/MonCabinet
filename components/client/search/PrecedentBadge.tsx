'use client'

/**
 * Composant PrecedentBadge - Sprint 4
 *
 * Badge affichant le score de précédent juridique (PageRank) avec :
 * - Score 0-100
 * - Couleur selon valeur (élevé = vert, moyen = amber, faible = bleu)
 * - Icône TrendingUp
 * - Tooltip explicatif (optionnel)
 *
 * Utilisé dans les résultats de recherche juridique et KB browser.
 */

import { TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip'

// =============================================================================
// TYPES
// =============================================================================

interface PrecedentBadgeProps {
  score: number // Score PageRank 0-100
  showTooltip?: boolean // Afficher tooltip explicatif
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Catégories de score précédent :
 * - Élevé (≥75) : Autorité juridique forte, arrêts de cassation souvent cités
 * - Moyen (50-74) : Influence modérée, arrêts d'appel ou de référence
 * - Standard (<50) : Précédent ordinaire
 */
const SCORE_CONFIG = {
  high: {
    threshold: 75,
    variant: 'default' as const,
    className: 'bg-green-600 text-white hover:bg-green-700',
    label: 'Autorité forte',
  },
  medium: {
    threshold: 50,
    variant: 'secondary' as const,
    className: 'bg-amber-500 text-white hover:bg-amber-600',
    label: 'Influence modérée',
  },
  standard: {
    threshold: 0,
    variant: 'outline' as const,
    className: 'border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400',
    label: 'Précédent ordinaire',
  },
}

const SIZE_CONFIG = {
  sm: {
    iconSize: 'h-3 w-3',
    fontSize: 'text-xs',
    padding: 'px-2 py-0.5',
  },
  md: {
    iconSize: 'h-3.5 w-3.5',
    fontSize: 'text-sm',
    padding: 'px-2.5 py-1',
  },
  lg: {
    iconSize: 'h-4 w-4',
    fontSize: 'text-base',
    padding: 'px-3 py-1.5',
  },
}

// =============================================================================
// COMPOSANT
// =============================================================================

export function PrecedentBadge({
  score,
  showTooltip = true,
  size = 'md',
  className = '',
}: PrecedentBadgeProps) {
  // Validation score
  const validScore = Math.max(0, Math.min(100, Math.round(score)))

  // Configuration selon score
  const config = getScoreConfig(validScore)
  const sizeConfig = SIZE_CONFIG[size]

  // Badge content
  const badgeContent = (
    <Badge
      variant={config.variant}
      className={`inline-flex items-center gap-1.5 ${config.className} ${sizeConfig.padding} ${sizeConfig.fontSize} ${className}`}
    >
      <TrendingUp className={sizeConfig.iconSize} />
      <span className="font-semibold">{validScore}</span>
    </Badge>
  )

  // Avec tooltip
  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {badgeContent}
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-semibold">Score de Précédent : {validScore}/100</p>
              <p className="text-xs text-muted-foreground">
                {config.label}
              </p>
              <p className="text-xs">
                Mesure l'autorité juridique basée sur :
              </p>
              <ul className="text-xs list-disc list-inside space-y-0.5 text-muted-foreground">
                <li>Nombre de citations reçues</li>
                <li>Hiérarchie du tribunal (Cassation &gt; Appel &gt; TPI)</li>
                <li>Ancienneté et stabilité de la jurisprudence</li>
                <li>Relations juridiques (confirmations, revirements)</li>
              </ul>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Sans tooltip
  return badgeContent
}

// =============================================================================
// HELPERS
// =============================================================================

function getScoreConfig(score: number) {
  if (score >= SCORE_CONFIG.high.threshold) {
    return SCORE_CONFIG.high
  } else if (score >= SCORE_CONFIG.medium.threshold) {
    return SCORE_CONFIG.medium
  } else {
    return SCORE_CONFIG.standard
  }
}

// =============================================================================
// EXPORTS UTILITAIRES
// =============================================================================

/**
 * Helper pour trier les résultats par score de précédent (décroissant)
 *
 * @example
 * const sortedResults = [...results].sort(sortByPrecedentScore)
 */
export function sortByPrecedentScore<T extends { precedentValue?: number }>(
  a: T,
  b: T
): number {
  const scoreA = a.precedentValue || 0
  const scoreB = b.precedentValue || 0
  return scoreB - scoreA
}

/**
 * Helper pour filtrer les résultats par score minimum
 *
 * @example
 * const highAuthorityResults = results.filter(r => hasPrecedentScoreAbove(r, 75))
 */
export function hasPrecedentScoreAbove<T extends { precedentValue?: number }>(
  item: T,
  minScore: number
): boolean {
  return (item.precedentValue || 0) >= minScore
}
