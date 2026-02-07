/**
 * Service de Re-ranking avec Cross-Encoder
 *
 * Utilise @xenova/transformers pour charger un modèle cross-encoder
 * qui score la pertinence de chaque paire (query, document).
 *
 * Le cross-encoder améliore significativement la qualité du ranking
 * car il peut capturer les interactions sémantiques entre query et document.
 *
 * OPTIMISATION: Import dynamique pour éviter de charger le module au démarrage
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

// Activer/désactiver le re-ranking
const RERANKER_ENABLED = process.env.RERANKER_ENABLED !== 'false'

// Modèle cross-encoder (téléchargé automatiquement au premier appel)
const RERANKER_MODEL = process.env.RERANKER_MODEL || 'Xenova/ms-marco-MiniLM-L-6-v2'

// Variables pour le module chargé dynamiquement
let transformersModule: { pipeline: any; env: any } | null = null

async function loadTransformers() {
  if (transformersModule) return transformersModule

  // @ts-ignore - @xenova/transformers n'a pas de types TypeScript complets
  const module = await import('@xenova/transformers')
  transformersModule = module

  // Configurer le cache après le chargement
  module.env.cacheDir = process.env.TRANSFORMERS_CACHE || './.cache/transformers'
  module.env.allowLocalModels = true
  module.env.allowRemoteModels = true

  return module
}

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

// Type pour le pipeline de reranking
type TextClassificationPipeline = (
  inputs: Array<{ text: string; text_pair: string }>,
  options?: { topk?: number }
) => Promise<Array<{ label: string; score: number }[]>>

// =============================================================================
// SINGLETON PIPELINE
// =============================================================================

let rerankerPipeline: TextClassificationPipeline | null = null
let pipelineLoading: Promise<TextClassificationPipeline> | null = null

/**
 * Charge le modèle cross-encoder (singleton, lazy loading)
 * Le premier appel télécharge le modèle (~80MB), les suivants utilisent le cache
 */
async function getRerankerPipeline(): Promise<TextClassificationPipeline | null> {
  if (!RERANKER_ENABLED) {
    return null
  }

  if (rerankerPipeline) {
    return rerankerPipeline
  }

  if (pipelineLoading) {
    return pipelineLoading
  }

  console.log(`[Reranker] Chargement du modèle ${RERANKER_MODEL}...`)
  const startTime = Date.now()

  pipelineLoading = (async () => {
    try {
      // Charger le module dynamiquement
      const { pipeline } = await loadTransformers()

      // Charger le pipeline pour le reranking (text-classification avec paires)
      const pipe = await pipeline('text-classification', RERANKER_MODEL, {
        quantized: true, // Utiliser le modèle quantifié (plus rapide, moins de mémoire)
      })

      rerankerPipeline = pipe as unknown as TextClassificationPipeline
      console.log(`[Reranker] Modèle chargé en ${Date.now() - startTime}ms`)
      return rerankerPipeline
    } catch (error) {
      console.error('[Reranker] Erreur chargement modèle:', error)
      throw error
    } finally {
      pipelineLoading = null
    }
  })()

  return pipelineLoading
}

// =============================================================================
// RE-RANKING
// =============================================================================

/**
 * Re-rank des documents avec un cross-encoder
 *
 * @param query - La question de l'utilisateur
 * @param documents - Les documents à re-rank
 * @param topK - Nombre de résultats à retourner (défaut: tous)
 * @returns Documents triés par score cross-encoder décroissant
 */
export async function rerankDocuments(
  query: string,
  documents: DocumentToRerank[],
  topK?: number
): Promise<RerankerResult[]> {
  if (!RERANKER_ENABLED || documents.length === 0) {
    // Fallback: retourner les documents dans l'ordre original
    return documents.map((_, index) => ({
      index,
      score: documents[index].originalScore,
      originalScore: documents[index].originalScore,
    }))
  }

  try {
    const pipe = await getRerankerPipeline()
    if (!pipe) {
      // Fallback si pipeline non disponible
      return documents.map((_, index) => ({
        index,
        score: documents[index].originalScore,
        originalScore: documents[index].originalScore,
      }))
    }

    const startTime = Date.now()

    // Préparer les paires (query, document) pour le modèle
    const pairs = documents.map((doc) => ({
      text: query,
      text_pair: doc.content.substring(0, 512), // Limiter la longueur
    }))

    // Scorer toutes les paires
    const results = await pipe(pairs) as Array<{ label: string; score: number }[] | { label: string; score: number }>

    // Extraire les scores et combiner avec les scores originaux
    const rankedResults: RerankerResult[] = results.map((result, index) => {
      // Le modèle retourne un score entre 0 et 1
      const crossEncoderScore = Array.isArray(result) ? result[0]?.score || 0 : (result as { score: number })?.score || 0

      return {
        index,
        score: crossEncoderScore,
        originalScore: documents[index].originalScore,
      }
    })

    // Trier par score cross-encoder décroissant
    rankedResults.sort((a, b) => b.score - a.score)

    // Limiter au topK si spécifié
    const finalResults = topK ? rankedResults.slice(0, topK) : rankedResults

    console.log(`[Reranker] ${documents.length} documents re-ranked en ${Date.now() - startTime}ms`)

    return finalResults
  } catch (error) {
    console.error('[Reranker] Erreur re-ranking:', error instanceof Error ? error.message : error)

    // Fallback: retourner les documents dans l'ordre original
    return documents.map((_, index) => ({
      index,
      score: documents[index].originalScore,
      originalScore: documents[index].originalScore,
    }))
  }
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
 * Précharge le modèle cross-encoder (à appeler au démarrage de l'app)
 */
export async function preloadReranker(): Promise<boolean> {
  if (!RERANKER_ENABLED) {
    console.log('[Reranker] Désactivé (RERANKER_ENABLED=false)')
    return false
  }

  try {
    await getRerankerPipeline()
    return true
  } catch {
    return false
  }
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
    loaded: rerankerPipeline !== null,
  }
}

// =============================================================================
// PRELOAD AU DÉMARRAGE
// =============================================================================

/**
 * Précharge le modèle cross-encoder au démarrage si PRELOAD_RERANKER=true
 * Élimine la latence +500ms sur la première requête de chaque session
 */
if (process.env.PRELOAD_RERANKER === 'true' && RERANKER_ENABLED) {
  console.log('[Reranker] Préchargement du modèle au démarrage...')
  preloadReranker()
    .then((success) => {
      if (success) {
        console.log('[Reranker] Modèle préchargé avec succès')
      }
    })
    .catch((err) => {
      console.error('[Reranker] Erreur préchargement:', err)
    })
}
