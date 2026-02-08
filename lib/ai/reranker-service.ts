/**
 * Service de Re-ranking avec TF-IDF local
 *
 * Implémente un re-ranking léger basé sur TF-IDF pour améliorer
 * la pertinence des résultats au-delà de la similarité cosinus.
 *
 * Remplace le cross-encoder @xenova/transformers (incompatible avec Next.js build).
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

// Re-ranking TF-IDF activé par défaut (léger, pas de dépendance externe)
const RERANKER_ENABLED = process.env.RERANKER_ENABLED !== 'false'

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
  topK?: number
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
    model: 'tfidf-local',
    loaded: RERANKER_ENABLED,
  }
}
