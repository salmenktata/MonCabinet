/**
 * Service de génération d'embeddings
 * Supporte Ollama (gratuit, local) et OpenAI (payant, cloud)
 * Priorité: Ollama > OpenAI
 *
 * Avec cache Redis pour éviter les régénérations inutiles.
 */

import OpenAI from 'openai'
import { aiConfig, getEmbeddingProvider } from './config'
import { getCachedEmbedding, setCachedEmbedding } from '@/lib/cache/embedding-cache'
import { countTokens } from './token-utils'

// =============================================================================
// CIRCUIT BREAKER PATTERN
// =============================================================================

/**
 * Circuit breaker pour protéger contre les appels à un service Ollama lent ou indisponible.
 * États:
 * - CLOSED: Normal, les appels passent
 * - OPEN: Échecs consécutifs, court-circuit vers fallback
 * - HALF_OPEN: Test de récupération après timeout
 */
interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  failures: number
  lastFailure: number
  successesSinceHalfOpen: number
}

// Configuration du circuit breaker (configurable via env)
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: parseInt(process.env.CB_FAILURE_THRESHOLD || '3', 10),
  resetTimeout: parseInt(process.env.CB_RESET_TIMEOUT_MS || '30000', 10),
  successThreshold: parseInt(process.env.CB_SUCCESS_THRESHOLD || '2', 10),
  halfOpenMaxConcurrent: parseInt(process.env.CB_HALF_OPEN_MAX || '1', 10),
}

// État global du circuit breaker pour Ollama
let ollamaCircuitBreaker: CircuitBreakerState = {
  state: 'CLOSED',
  failures: 0,
  lastFailure: 0,
  successesSinceHalfOpen: 0,
}

// Compteur de requêtes en cours en HALF_OPEN (pour limiter la concurrence)
let halfOpenInFlight = 0

/**
 * Vérifie si le circuit breaker permet un appel à Ollama
 */
function canCallOllama(): boolean {
  const now = Date.now()

  switch (ollamaCircuitBreaker.state) {
    case 'CLOSED':
      return true

    case 'OPEN':
      // Vérifier si on peut passer en half-open
      if (now - ollamaCircuitBreaker.lastFailure >= CIRCUIT_BREAKER_CONFIG.resetTimeout) {
        console.log('[CircuitBreaker] Ollama: OPEN → HALF_OPEN (test de récupération)')
        ollamaCircuitBreaker.state = 'HALF_OPEN'
        ollamaCircuitBreaker.successesSinceHalfOpen = 0
        halfOpenInFlight = 0
        return true
      }
      return false

    case 'HALF_OPEN':
      // Limiter les requêtes concurrentes en half-open pour éviter de surcharger
      if (halfOpenInFlight >= CIRCUIT_BREAKER_CONFIG.halfOpenMaxConcurrent) {
        return false
      }
      halfOpenInFlight++
      return true

    default:
      return true
  }
}

/**
 * Décrémente le compteur de requêtes en vol (appelé après succès/échec en HALF_OPEN)
 */
function decrementHalfOpenInFlight(): void {
  if (ollamaCircuitBreaker.state === 'HALF_OPEN' && halfOpenInFlight > 0) {
    halfOpenInFlight--
  }
}

/**
 * Enregistre un succès pour le circuit breaker
 */
function recordOllamaSuccess(): void {
  if (ollamaCircuitBreaker.state === 'HALF_OPEN') {
    decrementHalfOpenInFlight()
    ollamaCircuitBreaker.successesSinceHalfOpen++
    if (ollamaCircuitBreaker.successesSinceHalfOpen >= CIRCUIT_BREAKER_CONFIG.successThreshold) {
      console.log('[CircuitBreaker] Ollama: HALF_OPEN → CLOSED (service récupéré)')
      ollamaCircuitBreaker.state = 'CLOSED'
      ollamaCircuitBreaker.failures = 0
      halfOpenInFlight = 0
    }
  } else if (ollamaCircuitBreaker.state === 'CLOSED') {
    // Reset des échecs sur succès
    ollamaCircuitBreaker.failures = 0
  }
}

/**
 * Enregistre un échec pour le circuit breaker
 */
function recordOllamaFailure(): void {
  ollamaCircuitBreaker.failures++
  ollamaCircuitBreaker.lastFailure = Date.now()

  if (ollamaCircuitBreaker.state === 'HALF_OPEN') {
    decrementHalfOpenInFlight()
    console.log('[CircuitBreaker] Ollama: HALF_OPEN → OPEN (échec du test)')
    ollamaCircuitBreaker.state = 'OPEN'
    halfOpenInFlight = 0
  } else if (ollamaCircuitBreaker.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    console.log(`[CircuitBreaker] Ollama: CLOSED → OPEN (${ollamaCircuitBreaker.failures} échecs consécutifs)`)
    ollamaCircuitBreaker.state = 'OPEN'
  }
}

/**
 * Retourne l'état actuel du circuit breaker (pour monitoring)
 */
export function getCircuitBreakerState(): {
  state: string
  failures: number
  lastFailureAgo: number | null
  halfOpenInFlight: number
  config: typeof CIRCUIT_BREAKER_CONFIG
} {
  return {
    state: ollamaCircuitBreaker.state,
    failures: ollamaCircuitBreaker.failures,
    lastFailureAgo: ollamaCircuitBreaker.lastFailure
      ? Date.now() - ollamaCircuitBreaker.lastFailure
      : null,
    halfOpenInFlight,
    config: { ...CIRCUIT_BREAKER_CONFIG },
  }
}

/**
 * Réinitialise manuellement le circuit breaker (pour recovery forcé)
 * À utiliser avec précaution depuis l'interface admin
 */
export function resetCircuitBreaker(): void {
  console.log('[CircuitBreaker] Reset manuel → CLOSED')
  ollamaCircuitBreaker = {
    state: 'CLOSED',
    failures: 0,
    lastFailure: 0,
    successesSinceHalfOpen: 0,
  }
  halfOpenInFlight = 0
}

// =============================================================================
// CLIENTS
// =============================================================================

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!aiConfig.openai.apiKey) {
      throw new Error(
        'OPENAI_API_KEY non configuré - Impossible de générer des embeddings via OpenAI'
      )
    }
    openaiClient = new OpenAI({ apiKey: aiConfig.openai.apiKey })
  }
  return openaiClient
}

// =============================================================================
// TYPES
// =============================================================================

export interface EmbeddingResult {
  embedding: number[]
  tokenCount: number
  provider: 'ollama' | 'openai'
}

export interface BatchEmbeddingResult {
  embeddings: number[][]
  totalTokens: number
  provider: 'ollama' | 'openai'
}

interface OllamaEmbeddingResponse {
  embedding: number[]
}

interface OllamaEmbeddingsResponse {
  embeddings: number[][]
}

// =============================================================================
// OLLAMA EMBEDDINGS
// =============================================================================

// Timeout pour les appels Ollama (30 secondes)
const OLLAMA_TIMEOUT_MS = 30000

/**
 * Génère un embedding via Ollama (local, gratuit)
 */
async function generateEmbeddingWithOllama(text: string): Promise<EmbeddingResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS)

  try {
    const response = await fetch(`${aiConfig.ollama.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: aiConfig.ollama.embeddingModel,
        prompt: text.substring(0, 30000), // Tronquer si trop long
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ollama embedding error: ${response.status} - ${errorText}`)
    }

    const data = await response.json() as OllamaEmbeddingResponse

    // Valider l'embedding
    const validation = validateEmbedding(data.embedding, 'ollama')
    if (!validation.valid) {
      console.error(`[Embeddings] Ollama embedding invalide: ${validation.error}`)
      throw new Error(`Embedding Ollama invalide: ${validation.error}`)
    }

    return {
      embedding: data.embedding,
      tokenCount: countTokens(text),
      provider: 'ollama',
    }
  } catch (error) {
    clearTimeout(timeoutId)

    // Erreurs spécifiques avec messages clairs
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(`Ollama ne répond pas (timeout ${OLLAMA_TIMEOUT_MS / 1000}s). Vérifiez que le service est démarré avec 'ollama serve'.`)
      }
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        throw new Error(`Ollama n'est pas accessible sur ${aiConfig.ollama.baseUrl}. Démarrez-le avec 'ollama serve'.`)
      }
    }
    throw error
  }
}

/**
 * Génère des embeddings en batch via Ollama
 */
async function generateEmbeddingsBatchWithOllama(
  texts: string[]
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0, provider: 'ollama' }
  }

  // Ollama peut traiter plusieurs textes en une seule requête
  // On utilise des requêtes parallèles pour éviter les timeouts sur de gros batches
  // Batch size augmenté de 10 à 20 pour améliorer le throughput (~+30%)
  const batchSize = 20
  const allEmbeddings: number[][] = []
  let totalTokens = 0

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)

    // Traiter le batch en parallèle
    const results = await Promise.all(
      batch.map(async (text) => {
        const result = await generateEmbeddingWithOllama(text)
        return result
      })
    )

    for (const result of results) {
      allEmbeddings.push(result.embedding)
      totalTokens += result.tokenCount
    }
  }

  return {
    embeddings: allEmbeddings,
    totalTokens,
    provider: 'ollama',
  }
}

// =============================================================================
// OPENAI EMBEDDINGS
// =============================================================================

/**
 * Génère un embedding via OpenAI
 */
async function generateEmbeddingWithOpenAI(text: string): Promise<EmbeddingResult> {
  const client = getOpenAIClient()

  const truncatedText = text.substring(0, 30000)

  const response = await client.embeddings.create({
    model: aiConfig.openai.embeddingModel,
    input: truncatedText,
    encoding_format: 'float',
  })

  const embedding = response.data[0].embedding

  // Valider l'embedding
  const validation = validateEmbedding(embedding, 'openai')
  if (!validation.valid) {
    console.error(`[Embeddings] OpenAI embedding invalide: ${validation.error}`)
    throw new Error(`Embedding OpenAI invalide: ${validation.error}`)
  }

  return {
    embedding,
    tokenCount: response.usage.total_tokens,
    provider: 'openai',
  }
}

/**
 * Génère des embeddings en batch via OpenAI
 */
async function generateEmbeddingsBatchWithOpenAI(
  texts: string[]
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0, provider: 'openai' }
  }

  const client = getOpenAIClient()

  const truncatedTexts = texts.map((t) => t.substring(0, 30000))

  const batchSize = 100
  const allEmbeddings: number[][] = []
  let totalTokens = 0

  for (let i = 0; i < truncatedTexts.length; i += batchSize) {
    const batch = truncatedTexts.slice(i, i + batchSize)

    const response = await client.embeddings.create({
      model: aiConfig.openai.embeddingModel,
      input: batch,
      encoding_format: 'float',
    })

    for (const item of response.data) {
      allEmbeddings.push(item.embedding)
    }

    totalTokens += response.usage.total_tokens
  }

  return {
    embeddings: allEmbeddings,
    totalTokens,
    provider: 'openai',
  }
}

// =============================================================================
// FONCTIONS PRINCIPALES (avec fallback automatique)
// =============================================================================

/**
 * Génère un embedding pour un texte unique
 * Utilise automatiquement le provider configuré (Ollama > OpenAI)
 * Avec cache Redis pour éviter les régénérations.
 * Intègre le circuit breaker pour la résilience Ollama.
 * @param text - Texte à encoder
 * @returns Vecteur embedding
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  // Vérifier le cache d'abord
  const cached = await getCachedEmbedding(text)
  if (cached) {
    return {
      embedding: cached.embedding,
      tokenCount: countTokens(text),
      provider: cached.provider,
    }
  }

  const provider = getEmbeddingProvider()
  let result: EmbeddingResult

  if (provider === 'ollama') {
    // Vérifier le circuit breaker avant d'appeler Ollama
    if (!canCallOllama()) {
      // Circuit ouvert: utiliser directement le fallback
      if (aiConfig.openai.apiKey) {
        console.warn('[Embeddings] Circuit breaker OPEN, fallback direct sur OpenAI')
        result = await generateEmbeddingWithOpenAI(text)
      } else {
        throw new Error(
          `Ollama indisponible (circuit breaker OPEN) et OpenAI non configuré. ` +
          `Attendez ${Math.ceil(CIRCUIT_BREAKER_CONFIG.resetTimeout / 1000)}s ou démarrez Ollama.`
        )
      }
    } else {
      try {
        result = await generateEmbeddingWithOllama(text)
        recordOllamaSuccess()
      } catch (error) {
        recordOllamaFailure()
        // Fallback sur OpenAI si Ollama échoue et OpenAI est configuré
        if (aiConfig.openai.apiKey) {
          console.warn(
            '[Embeddings] Ollama non disponible, fallback sur OpenAI:',
            error instanceof Error ? error.message : error
          )
          result = await generateEmbeddingWithOpenAI(text)
        } else {
          throw error
        }
      }
    }
  } else if (provider === 'openai') {
    result = await generateEmbeddingWithOpenAI(text)
  } else {
    throw new Error(
      'Aucun provider d\'embeddings configuré. Activez OLLAMA_ENABLED=true ou configurez OPENAI_API_KEY'
    )
  }

  // Mettre en cache le résultat
  await setCachedEmbedding(text, result.embedding, result.provider)

  return result
}

/**
 * Génère des embeddings pour plusieurs textes en batch
 * Plus efficace que des appels individuels
 * Intègre le circuit breaker pour la résilience Ollama.
 * @param texts - Liste de textes à encoder
 * @returns Liste de vecteurs embeddings
 */
export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<BatchEmbeddingResult> {
  const provider = getEmbeddingProvider()

  if (provider === 'ollama') {
    // Vérifier le circuit breaker avant d'appeler Ollama
    if (!canCallOllama()) {
      if (aiConfig.openai.apiKey) {
        console.warn('[Embeddings] Circuit breaker OPEN pour batch, fallback direct sur OpenAI')
        return await generateEmbeddingsBatchWithOpenAI(texts)
      }
      throw new Error(
        `Ollama indisponible (circuit breaker OPEN) et OpenAI non configuré. ` +
        `Attendez ${Math.ceil(CIRCUIT_BREAKER_CONFIG.resetTimeout / 1000)}s ou démarrez Ollama.`
      )
    }

    try {
      const result = await generateEmbeddingsBatchWithOllama(texts)
      recordOllamaSuccess()
      return result
    } catch (error) {
      recordOllamaFailure()
      if (aiConfig.openai.apiKey) {
        console.warn(
          '[Embeddings] Ollama non disponible pour batch, fallback sur OpenAI:',
          error instanceof Error ? error.message : error
        )
        return await generateEmbeddingsBatchWithOpenAI(texts)
      }
      throw error
    }
  }

  if (provider === 'openai') {
    return await generateEmbeddingsBatchWithOpenAI(texts)
  }

  throw new Error(
    'Aucun provider d\'embeddings configuré. Activez OLLAMA_ENABLED=true ou configurez OPENAI_API_KEY'
  )
}

/**
 * Calcule la similarité cosinus entre deux vecteurs
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Les vecteurs doivent avoir la même dimension')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Formate un vecteur pour l'insertion PostgreSQL/pgvector
 * @param embedding - Vecteur numérique
 * @returns String au format pgvector '[0.1, 0.2, ...]'
 */
export function formatEmbeddingForPostgres(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

/**
 * Parse un vecteur depuis le format PostgreSQL
 */
export function parseEmbeddingFromPostgres(pgVector: string): number[] {
  const cleaned = pgVector.replace(/[\[\]\(\)]/g, '')
  return cleaned.split(',').map((s) => parseFloat(s.trim()))
}

// =============================================================================
// VALIDATION DES EMBEDDINGS
// =============================================================================

// Dimensions attendues par provider
const EXPECTED_DIMENSIONS: Record<string, number> = {
  ollama: aiConfig.ollama.embeddingDimensions,
  openai: aiConfig.openai.embeddingDimensions,
}

/**
 * Valide un embedding généré
 * Vérifie: dimensions, valeurs finies, norme non-nulle
 */
export function validateEmbedding(
  embedding: number[],
  provider: 'ollama' | 'openai'
): { valid: boolean; error?: string } {
  // Vérifier que l'embedding existe
  if (!embedding || !Array.isArray(embedding)) {
    return { valid: false, error: 'Embedding null ou non-tableau' }
  }

  // Vérifier les dimensions - BLOQUANT pour éviter erreurs pgvector
  const expectedDim = EXPECTED_DIMENSIONS[provider]
  if (embedding.length !== expectedDim) {
    return {
      valid: false,
      error: `Dimensions incorrectes: ${embedding.length} (attendu: ${expectedDim} pour ${provider}). ` +
        `Vecteur incompatible avec la colonne vector(${expectedDim}).`,
    }
  }

  // Vérifier que toutes les valeurs sont des nombres finis
  let hasInvalidValue = false
  let normSquared = 0

  for (let i = 0; i < embedding.length; i++) {
    const val = embedding[i]
    if (!Number.isFinite(val)) {
      hasInvalidValue = true
      break
    }
    normSquared += val * val
  }

  if (hasInvalidValue) {
    return { valid: false, error: 'Embedding contient des valeurs non-finies (NaN/Infinity)' }
  }

  // Vérifier que la norme n'est pas nulle ou quasi-nulle
  // Norme < 0.5 = embedding quasi-nul → similarité cosinus erratique
  const norm = Math.sqrt(normSquared)
  if (norm < 0.5) {
    return {
      valid: false,
      error: `Embedding norme trop faible: ${norm.toFixed(4)} (minimum: 0.5). ` +
        `Similarité cosinus non fiable avec un vecteur quasi-nul.`,
    }
  }

  // Warning pour normes inhabituelles (mais pas bloquant)
  if (norm > 100) {
    console.warn(`[Embeddings] Norme inhabituellement élevée: ${norm.toFixed(4)}`)
  }

  return { valid: true }
}

// =============================================================================
// UTILITAIRES
// =============================================================================

// Re-export depuis token-utils pour compatibilité
export { countTokens, estimateTokenCount } from './token-utils'

/**
 * Vérifie si le service d'embeddings est disponible
 */
export function isEmbeddingsServiceAvailable(): boolean {
  return aiConfig.ollama.enabled || !!aiConfig.openai.apiKey
}

/**
 * Vérifie si Ollama est accessible
 */
export async function checkOllamaHealth(): Promise<boolean> {
  if (!aiConfig.ollama.enabled) return false

  try {
    const response = await fetch(`${aiConfig.ollama.baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Retourne les informations sur le provider d'embeddings actif
 */
export function getEmbeddingProviderInfo(): {
  provider: 'ollama' | 'openai' | null
  model: string
  dimensions: number
  cost: 'free' | 'paid'
} {
  const provider = getEmbeddingProvider()

  if (provider === 'ollama') {
    return {
      provider: 'ollama',
      model: aiConfig.ollama.embeddingModel,
      dimensions: aiConfig.ollama.embeddingDimensions,
      cost: 'free',
    }
  }

  if (provider === 'openai') {
    return {
      provider: 'openai',
      model: aiConfig.openai.embeddingModel,
      dimensions: aiConfig.openai.embeddingDimensions,
      cost: 'paid',
    }
  }

  return {
    provider: null,
    model: 'none',
    dimensions: 0,
    cost: 'free',
  }
}
