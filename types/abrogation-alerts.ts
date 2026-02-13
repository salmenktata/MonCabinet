/**
 * Types centralisés pour les alertes d'abrogation
 * Phase 3.4 - Intégration Assistant IA
 */

import type { AbrogationSearchResult } from './legal-abrogations'

export interface LegalReference {
  text: string
  type: 'law' | 'code' | 'article' | 'decree'
  confidence: number
}

export interface AbrogationAlert {
  reference: LegalReference
  abrogation: AbrogationSearchResult
  severity: 'critical' | 'warning' | 'info'
  message: string
  replacementSuggestion?: string
}
