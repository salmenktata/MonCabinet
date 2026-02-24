/**
 * Service de Re-ranking
 *
 * Stratégie par ordre de priorité :
 * 1. Jina Reranker v2 via API HTTP (si JINA_API_KEY configuré) — sémantique, multilingue
 * 2. TF-IDF local (fallback léger, pas de dépendance externe)
 *
 * Jina Reranker v2 supporte arabe + français nativement (meilleure précision que TF-IDF).
 * Fix Feb 24, 2026 : cross-encoder @xenova/transformers incompatible Next.js → Jina HTTP.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface RerankerResult {
  index: number
  score: number
  originalScore: number
  metadata?: Record<string, unknown>  // Phase 4: metadata boost similar_to
}

export interface DocumentToRerank {
  content: string
  originalScore: number
  metadata?: Record<string, unknown>
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Re-ranking activé par défaut
const RERANKER_ENABLED = process.env.RERANKER_ENABLED !== 'false'

// Jina Reranker API (prioritaire si JINA_API_KEY configuré)
const JINA_API_KEY = process.env.JINA_API_KEY
const JINA_RERANK_URL = 'https://api.jina.ai/v1/rerank'
const JINA_RERANK_MODEL = process.env.JINA_RERANK_MODEL || 'jina-reranker-v2-base-multilingual'
// =============================================================================
// JINA RERANKER (sémantique multilingue via HTTP — pas de build step)
// =============================================================================

/**
 * Re-rank via Jina Reranker v2 (multilingue : arabe + français natifs)
 * Retourne null si Jina non configuré ou en erreur → fallback TF-IDF
 */
async function rerankWithJina(
  query: string,
  documents: DocumentToRerank[],
  topK?: number
): Promise<RerankerResult[] | null> {
  if (!JINA_API_KEY) return null

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000) // 8s timeout

  try {
    const response = await fetch(JINA_RERANK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JINA_API_KEY}`,
      },
      body: JSON.stringify({
        model: JINA_RERANK_MODEL,
        query,
        documents: documents.map(d => d.content),
        top_n: topK || documents.length,
        return_documents: false,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      console.warn(`[Reranker Jina] HTTP ${response.status} — fallback TF-IDF`)
      return null
    }

    const data = await response.json() as {
      results: Array<{ index: number; relevance_score: number }>
    }

    // Combiner score Jina (70%) + score vectoriel original (30%)
    const results: RerankerResult[] = data.results.map(r => ({
      index: r.index,
      score: r.relevance_score * 0.7 + (documents[r.index]?.originalScore ?? 0) * 0.3,
      originalScore: documents[r.index]?.originalScore ?? 0,
    }))

    results.sort((a, b) => b.score - a.score)
    console.log(`[Reranker] ✓ Jina v2 multilingue: ${results.length} résultats (top=${results[0]?.score.toFixed(3)})`)
    return results
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.warn('[Reranker Jina] Erreur:', error.message, '— fallback TF-IDF')
    } else {
      console.warn('[Reranker Jina] Timeout — fallback TF-IDF')
    }
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

// =============================================================================
// TF-IDF RE-RANKING
// =============================================================================

/**
 * Tokenize un texte en mots normalisés (supporte arabe et français)
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Garder les caractères arabes, latins et chiffres
    .replace(/[^\u0600-\u06FF\u0750-\u077Fa-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
}

/**
 * Calcule la fréquence de terme (TF) pour chaque mot d'un document
 */
function computeTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  const len = tokens.length
  if (len === 0) return tf

  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1)
  }

  // Normaliser par la longueur du document
  for (const [token, count] of tf) {
    tf.set(token, count / len)
  }

  return tf
}

/**
 * Calcule l'IDF (Inverse Document Frequency) sur un corpus
 */
function computeIDF(documents: string[][]): Map<string, number> {
  const idf = new Map<string, number>()
  const N = documents.length

  if (N === 0) return idf

  // Compter dans combien de documents chaque terme apparaît
  const docFreq = new Map<string, number>()
  for (const tokens of documents) {
    const uniqueTokens = new Set(tokens)
    for (const token of uniqueTokens) {
      docFreq.set(token, (docFreq.get(token) || 0) + 1)
    }
  }

  // Calculer IDF: log(N / (1 + df)) + 1
  for (const [token, df] of docFreq) {
    idf.set(token, Math.log(N / (1 + df)) + 1)
  }

  return idf
}

/**
 * Calcule le score TF-IDF entre une query et un document
 */
function tfidfScore(
  queryTokens: string[],
  docTF: Map<string, number>,
  idf: Map<string, number>
): number {
  let score = 0
  const queryTerms = new Set(queryTokens)

  for (const term of queryTerms) {
    const tf = docTF.get(term) || 0
    const idfVal = idf.get(term) || 0
    score += tf * idfVal
  }

  return score
}

/**
 * Re-rank des documents en utilisant TF-IDF local
 *
 * Calcule un score TF-IDF entre la query et chaque document,
 * puis combine avec le score de similarité vectorielle original.
 *
 * @param query - La question de l'utilisateur
 * @param documents - Les documents à re-rank
 * @param topK - Nombre de résultats à retourner (défaut: tous)
 * @returns Documents re-rankés avec scores combinés
 */
export async function rerankDocuments(
  query: string,
  documents: DocumentToRerank[],
  topK?: number,
  options: {
    useCrossEncoder?: boolean  // ✨ NOUVEAU Sprint 3
  } = {}
): Promise<RerankerResult[]> {
  if (!RERANKER_ENABLED || documents.length <= 1) {
    // Fallback: retourner triés par score original
    const results = documents.map((doc, index) => ({
      index,
      score: doc.originalScore,
      originalScore: doc.originalScore,
    }))
    results.sort((a, b) => b.score - a.score)
    return topK ? results.slice(0, topK) : results
  }

  // Priorité 1 : Jina Reranker v2 multilingue via HTTP (arabe + français natifs)
  // Activé si JINA_API_KEY configuré — pas de build step, simple HTTP
  if (JINA_API_KEY) {
    const jinaResults = await rerankWithJina(query, documents, topK)
    if (jinaResults) {
      return topK ? jinaResults.slice(0, topK) : jinaResults
    }
    // Si Jina échoue → continuer vers TF-IDF fallback
  }

  // Priorité 2 (legacy): Cross-Encoder neural si activé
  // TEMPORAIREMENT DÉSACTIVÉ pour build production (incompatible Next.js)
  const useCrossEncoder = options.useCrossEncoder !== false && !JINA_API_KEY

  if (useCrossEncoder) {
    try {
      console.log('[Reranker] Utilisation cross-encoder neural...')
      const { rerankWithCrossEncoder } = await import('./cross-encoder-service')
      const contents = documents.map((doc) => doc.content)
      const crossEncoderResults = await rerankWithCrossEncoder(query, contents, topK)
      const results: RerankerResult[] = crossEncoderResults.map((ce) => {
        const originalDoc = documents[ce.index]
        return {
          index: ce.index,
          score: ce.score * 0.7 + originalDoc.originalScore * 0.3,
          originalScore: originalDoc.originalScore,
        }
      })
      console.log(`[Reranker] ✓ Cross-encoder: ${results.length} résultats (top score: ${(results[0]?.score * 100).toFixed(1)}%)`)
      return results
    } catch (error) {
      console.error('[Reranker] Cross-encoder échoué, fallback TF-IDF:', error instanceof Error ? error.message : error)
    }
  }

  // Priorité 3 : TF-IDF local (fallback universel, pas de dépendance externe)
  console.log('[Reranker] Utilisation TF-IDF (fallback)...')

  // Tokenizer la query et les documents
  const queryTokens = tokenize(query)
  const docTokensList = documents.map((doc) => tokenize(doc.content))

  // Calculer IDF sur le corpus (query + documents)
  const idf = computeIDF([queryTokens, ...docTokensList])

  // Calculer les scores TF-IDF
  const tfidfScores: number[] = []
  for (const docTokens of docTokensList) {
    const docTF = computeTF(docTokens)
    tfidfScores.push(tfidfScore(queryTokens, docTF, idf))
  }

  // Normaliser les scores TF-IDF entre 0 et 1
  const maxTFIDF = Math.max(...tfidfScores, 0.001)
  const normalizedTFIDF = tfidfScores.map((s) => s / maxTFIDF)

  // Combiner avec les scores originaux
  const results: RerankerResult[] = documents.map((doc, index) => ({
    index,
    score: combineScores(normalizedTFIDF[index], doc.originalScore),
    originalScore: doc.originalScore,
  }))

  // Trier par score combiné décroissant
  results.sort((a, b) => b.score - a.score)

  return topK ? results.slice(0, topK) : results
}

/**
 * Combine le score TF-IDF avec les autres facteurs (boost, similarité)
 *
 * Formule: finalScore = tfidfScore * weight + boostScore * (1 - weight)
 * Le poids par défaut donne 40% au TF-IDF et 60% au score vectoriel existant
 */
export function combineScores(
  tfidfScore: number,
  boostScore: number,
  weight: number = 0.4
): number {
  return tfidfScore * weight + boostScore * (1 - weight)
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
 * Précharge le modèle (no-op pour TF-IDF car pas de modèle à charger)
 */
export async function preloadReranker(): Promise<boolean> {
  if (RERANKER_ENABLED) {
    console.log('[Reranker] TF-IDF local activé (léger, sans dépendance externe)')
    return true
  }
  console.log('[Reranker] Désactivé (RERANKER_ENABLED=false)')
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
    model: JINA_API_KEY ? JINA_RERANK_MODEL : 'tfidf-local',
    loaded: RERANKER_ENABLED,
  }
}

// =============================================================================
// PHASE 4: BOOST SIMILAR_TO
// =============================================================================

/**
 * Interface pour document avec ID KB (requis pour similar_to boost)
 */
export interface DocumentWithKBId extends DocumentToRerank {
  knowledgeBaseId?: string
}

/**
 * Booste les documents liés au top résultat via relations similar_to
 *
 * Phase 4: Si le top résultat a des relations similar_to validées,
 * on booste les documents liés pour améliorer leur score.
 *
 * @param results - Résultats déjà re-rankés
 * @param documents - Documents originaux avec KB IDs
 * @returns Résultats avec boost similar_to appliqué
 */
export async function boostSimilarDocuments(
  results: RerankerResult[],
  documents: DocumentWithKBId[]
): Promise<RerankerResult[]> {
  if (results.length === 0 || !documents[0].knowledgeBaseId) {
    return results
  }

  const topResultIndex = results[0].index
  const topDocId = documents[topResultIndex].knowledgeBaseId

  if (!topDocId) {
    return results
  }

  try {
    // Import dynamique pour éviter circular dependency
    const { db } = await import('@/lib/db/postgres')

    // Récupérer relations similar_to du top document
    const relationsResult = await db.query(
      `SELECT
        rel.target_kb_id,
        rel.relation_strength
       FROM kb_legal_relations rel
       WHERE rel.source_kb_id = $1
         AND rel.relation_type = 'similar_to'
         AND rel.validated = true
         AND rel.relation_strength >= 0.7`,
      [topDocId]
    )

    if (relationsResult.rows.length === 0) {
      // Pas de relations similar_to, retourner tel quel
      return results
    }

    // Créer map ID → strength
    const similarDocsMap = new Map<string, number>()
    for (const row of relationsResult.rows) {
      similarDocsMap.set(row.target_kb_id, parseFloat(row.relation_strength))
    }

    console.log(
      `[Reranker Similar To] ${similarDocsMap.size} documents similaires au top résultat détectés`
    )

    // Appliquer boost aux documents liés
    const boostedResults = results.map((result) => {
      const doc = documents[result.index]
      const docKbId = doc.knowledgeBaseId

      if (!docKbId || !similarDocsMap.has(docKbId)) {
        // Pas de relation similar_to, score inchangé
        return result
      }

      // Calculer boost : strength * 0.3 (max +30% boost)
      const relationStrength = similarDocsMap.get(docKbId)!
      const boostMultiplier = 1 + relationStrength * 0.3

      const boostedScore = result.score * boostMultiplier

      console.log(
        `[Reranker Similar To] Boost ${doc.metadata?.title || docKbId}: ${(result.score * 100).toFixed(1)}% → ${(boostedScore * 100).toFixed(1)}% (strength: ${relationStrength.toFixed(2)})`
      )

      return {
        ...result,
        score: boostedScore,
        // Ajouter metadata pour traçabilité
        metadata: {
          ...result.metadata,
          boostedBySimilarTo: true,
          similarToStrength: relationStrength,
        },
      }
    })

    // Retrier après boost
    boostedResults.sort((a, b) => b.score - a.score)

    return boostedResults
  } catch (error) {
    console.error(
      '[Reranker Similar To] Erreur boost:',
      error instanceof Error ? error.message : error
    )
    // En cas d'erreur, retourner résultats originaux
    return results
  }
}

/**
 * Re-rank avec boost similar_to intégré
 *
 * Fonction convenience qui combine re-ranking + boost similar_to
 */
export async function rerankWithSimilarToBoost(
  query: string,
  documents: DocumentWithKBId[],
  topK?: number,
  options: {
    useCrossEncoder?: boolean
    enableSimilarToBoost?: boolean
  } = {}
): Promise<RerankerResult[]> {
  const { enableSimilarToBoost = true, ...rerankOptions } = options

  // 1. Re-ranking initial (TF-IDF ou cross-encoder)
  const rerankedResults = await rerankDocuments(query, documents, topK, rerankOptions)

  // 2. Boost similar_to (Phase 4)
  if (enableSimilarToBoost) {
    return await boostSimilarDocuments(rerankedResults, documents)
  }

  return rerankedResults
}
