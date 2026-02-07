/**
 * Service de Re-ranking avec Cross-Encoder
 *
 * TEMPORAIREMENT DÉSACTIVÉ: @xenova/transformers cause des erreurs de build
 * Le module utilise des APIs navigateur (File) non disponibles côté serveur Next.js
 *
 * TODO: Réactiver quand @xenova/transformers supporte Node.js proprement
 * ou migrer vers une alternative compatible (ex: API externe de reranking)
 */

// =============================================================================
// TYPES
// =============================================================================

export interface RerankerResult {
  index: number
  score: number
  originalScore: number
}

export interface DocumentToRerank {
  content: string
  originalScore: number
  metadata?: Record<string, unknown>
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Reranker désactivé temporairement - @xenova/transformers incompatible avec build Next.js
const RERANKER_ENABLED = false
const RERANKER_MODEL = process.env.RERANKER_MODEL || 'Xenova/ms-marco-MiniLM-L-6-v2'

// =============================================================================
// RE-RANKING (FALLBACK - RERANKER DÉSACTIVÉ)
// =============================================================================

/**
 * Re-rank des documents
 *
 * NOTE: Actuellement désactivé, retourne les documents dans l'ordre original
 * avec leurs scores de similarité vectorielle
 *
 * @param query - La question de l'utilisateur
 * @param documents - Les documents à re-rank
 * @param topK - Nombre de résultats à retourner (défaut: tous)
 * @returns Documents avec scores originaux
 */
export async function rerankDocuments(
  query: string,
  documents: DocumentToRerank[],
  topK?: number
): Promise<RerankerResult[]> {
  // Fallback: retourner les documents triés par score original décroissant
  const results = documents.map((doc, index) => ({
    index,
    score: doc.originalScore,
    originalScore: doc.originalScore,
  }))

  // Trier par score décroissant
  results.sort((a, b) => b.score - a.score)

  // Limiter au topK si spécifié
  return topK ? results.slice(0, topK) : results
}

/**
 * Combine le score cross-encoder avec les autres facteurs (boost, similarité)
 *
 * Formule: finalScore = crossEncoderScore * weight + boostScore * (1 - weight)
 * Le poids par défaut donne 60% au cross-encoder et 40% au boost existant
 */
export function combineScores(
  crossEncoderScore: number,
  boostScore: number,
  weight: number = 0.6
): number {
  return crossEncoderScore * weight + boostScore * (1 - weight)
}

// =============================================================================
// UTILITAIRES
// =============================================================================

/**
 * Vérifie si le service de re-ranking est activé
 */
export function isRerankerEnabled(): boolean {
  return RERANKER_ENABLED
}

/**
 * Précharge le modèle cross-encoder (no-op quand désactivé)
 */
export async function preloadReranker(): Promise<boolean> {
  console.log('[Reranker] Désactivé temporairement (problème de compatibilité build)')
  return false
}

/**
 * Statistiques du reranker
 */
export function getRerankerInfo(): {
  enabled: boolean
  model: string
  loaded: boolean
} {
  return {
    enabled: RERANKER_ENABLED,
    model: RERANKER_MODEL,
    loaded: false,
  }
}
