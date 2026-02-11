/**
 * Service de génération d'embeddings
 * Supporte Ollama (gratuit, local) et OpenAI (payant, cloud)
 * Priorité: Ollama > OpenAI
 *
 * Avec cache Redis pour éviter les régénérations inutiles.
 */

import OpenAI from 'openai'
import { aiConfig, getEmbeddingProvider, getEmbeddingFallbackProvider, EMBEDDING_TURBO_CONFIG } from './config'
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
// Seuils élevés pour tolérer la lenteur d'Ollama CPU-only
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: parseInt(process.env.CB_FAILURE_THRESHOLD || '5', 10),
  resetTimeout: parseInt(process.env.CB_RESET_TIMEOUT_MS || '60000', 10),
  successThreshold: parseInt(process.env.CB_SUCCESS_THRESHOLD || '1', 10),
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
// Plus de client OpenAI - Ollama uniquement

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

export interface EmbeddingOptions {
  forceTurbo?: boolean
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

// Timeout pour les appels Ollama (120 secondes)
// CPU-only sur VPS 4 cores → le chargement du modèle peut prendre 30s+
const OLLAMA_TIMEOUT_MS = 120000

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
        prompt: text.substring(0, 6500), // Limite ~7800 tokens (ratio 1.2 char/token)
        keep_alive: '10m', // Garder le modèle en mémoire 10min (évite le rechargement)
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
 *
 * Optimisé pour VPS 4 cores : traite 2 embeddings en parallèle
 * Performance: -50% temps total (200s → 100s pour 10 chunks)
 */
async function generateEmbeddingsBatchWithOllama(
  texts: string[]
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0, provider: 'ollama' }
  }

  // Configuration: nombre d'embeddings parallèles (2 optimal pour VPS 4 cores)
  const concurrency = parseInt(
    process.env.OLLAMA_EMBEDDING_CONCURRENCY || '2',
    10
  )

  const allEmbeddings: number[][] = []
  let totalTokens = 0

  // Traiter par batches parallèles
  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency)

    // Traiter le batch en parallèle
    const batchResults = await Promise.all(
      batch.map((text) => generateEmbeddingWithOllama(text))
    )

    // Agréger résultats
    for (const result of batchResults) {
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
// OPENAI EMBEDDINGS (Fallback + Mode Turbo)
// =============================================================================

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!aiConfig.openai.apiKey) {
      throw new Error('OpenAI API key non configurée (OPENAI_API_KEY)')
    }
    openaiClient = new OpenAI({ apiKey: aiConfig.openai.apiKey })
  }
  return openaiClient
}

/**
 * Génère un embedding via OpenAI (text-embedding-3-small, 1024 dimensions)
 * Coût: ~$0.02 / 1M tokens (~0.00001$ par embedding)
 */
async function generateEmbeddingWithOpenAI(text: string): Promise<EmbeddingResult> {
  const client = getOpenAIClient()

  const response = await client.embeddings.create({
    model: aiConfig.openai.embeddingModel,
    input: text.substring(0, 6500), // Limite 8192 tokens (ratio ~1.2)
    dimensions: aiConfig.openai.embeddingDimensions, // 1024 (compatible pgvector)
  })

  const embedding = response.data[0].embedding

  // Valider l'embedding
  const validation = validateEmbedding(embedding, 'openai')
  if (!validation.valid) {
    throw new Error(`Embedding OpenAI invalide: ${validation.error}`)
  }

  return {
    embedding,
    tokenCount: response.usage.total_tokens,
    provider: 'openai',
  }
}

/**
 * Génère des embeddings en batch via OpenAI (natif, jusqu'à 2048 textes/appel)
 * Beaucoup plus rapide que Ollama : ~0.1s pour un batch vs ~19s/embedding
 */
async function generateEmbeddingsBatchWithOpenAI(
  texts: string[]
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0, provider: 'openai' }
  }

  const client = getOpenAIClient()

  // OpenAI supporte jusqu'à 2048 inputs par appel
  const MAX_BATCH = 2048
  const allEmbeddings: number[][] = []
  let totalTokens = 0

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH).map(t => t.substring(0, 8000))

    const response = await client.embeddings.create({
      model: aiConfig.openai.embeddingModel,
      input: batch,
      dimensions: aiConfig.openai.embeddingDimensions,
    })

    // Trier par index pour garantir l'ordre
    const sorted = response.data.sort((a, b) => a.index - b.index)
    for (const item of sorted) {
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
 * Avec cache Redis, circuit breaker Ollama, et fallback OpenAI.
 *
 * Chaîne de résolution :
 * - Mode turbo (forceTurbo=true ou EMBEDDING_TURBO_MODE=true) → OpenAI direct
 * - Mode normal → Ollama, puis fallback OpenAI si circuit breaker OPEN
 * - Pas d'OpenAI configuré → throw (comportement actuel)
 *
 * @param text - Texte à encoder
 * @param options - Options (forceTurbo pour utiliser OpenAI directement)
 * @returns Vecteur embedding
 */
export async function generateEmbedding(
  text: string,
  options?: EmbeddingOptions
): Promise<EmbeddingResult> {
  const turbo = options?.forceTurbo || EMBEDDING_TURBO_CONFIG.enabled

  // Vérifier le cache d'abord
  const cached = await getCachedEmbedding(text)
  if (cached) {
    return {
      embedding: cached.embedding,
      tokenCount: countTokens(text),
      provider: cached.provider as 'ollama' | 'openai',
    }
  }

  const provider = getEmbeddingProvider()
  const fallbackProvider = getEmbeddingFallbackProvider()

  // Mode turbo : OpenAI direct (si disponible)
  if (turbo && aiConfig.openai.apiKey) {
    try {
      const result = await generateEmbeddingWithOpenAI(text)
      await setCachedEmbedding(text, result.embedding, result.provider)
      return result
    } catch (error) {
      console.error('[Embeddings] Erreur OpenAI turbo:', error instanceof Error ? error.message : error)
      // En turbo, si OpenAI échoue, tenter Ollama en fallback
      if (provider === 'ollama' && canCallOllama()) {
        try {
          const result = await generateEmbeddingWithOllama(text)
          recordOllamaSuccess()
          await setCachedEmbedding(text, result.embedding, result.provider)
          return result
        } catch (ollamaError) {
          recordOllamaFailure()
          throw new Error(
            `Embeddings indisponibles (OpenAI et Ollama en échec). ` +
            `OpenAI: ${error instanceof Error ? error.message : error}. ` +
            `Ollama: ${ollamaError instanceof Error ? ollamaError.message : ollamaError}`
          )
        }
      }
      throw error
    }
  }

  // Mode normal : Ollama prioritaire
  if (provider === 'ollama') {
    if (canCallOllama()) {
      try {
        const result = await generateEmbeddingWithOllama(text)
        recordOllamaSuccess()
        await setCachedEmbedding(text, result.embedding, result.provider)
        return result
      } catch (error) {
        recordOllamaFailure()
        // Tenter fallback OpenAI
        if (fallbackProvider === 'openai') {
          console.log('[Embeddings] Ollama en échec, fallback vers OpenAI')
          try {
            const result = await generateEmbeddingWithOpenAI(text)
            await setCachedEmbedding(text, result.embedding, result.provider)
            return result
          } catch (openaiError) {
            throw new Error(
              `Embeddings indisponibles (Ollama et OpenAI en échec). ` +
              `Ollama: ${error instanceof Error ? error.message : error}. ` +
              `OpenAI: ${openaiError instanceof Error ? openaiError.message : openaiError}`
            )
          }
        }
        throw new Error(
          `Impossible de générer l'embedding : ${error instanceof Error ? error.message : error}. ` +
          `Vérifiez qu'Ollama est démarré ("ollama serve") et que le modèle "${aiConfig.ollama.embeddingModel}" est disponible.`
        )
      }
    }

    // Circuit breaker OPEN : fallback OpenAI si disponible
    if (fallbackProvider === 'openai') {
      console.log('[Embeddings] Circuit breaker OPEN, fallback vers OpenAI')
      try {
        const result = await generateEmbeddingWithOpenAI(text)
        await setCachedEmbedding(text, result.embedding, result.provider)
        return result
      } catch (error) {
        throw new Error(
          `Service d'embeddings indisponible (Ollama circuit breaker OPEN, OpenAI en échec). ` +
          `OpenAI: ${error instanceof Error ? error.message : error}`
        )
      }
    }

    const cbState = getCircuitBreakerState()
    const resetIn = Math.ceil((CIRCUIT_BREAKER_CONFIG.resetTimeout - cbState.lastFailureAgo!) / 1000)
    throw new Error(
      `Service d'embeddings indisponible (circuit breaker OPEN). ` +
      `Réessayez dans ${resetIn}s. Vérifiez "ollama serve" et le modèle "${aiConfig.ollama.embeddingModel}".`
    )
  }

  // Provider OpenAI seul (pas d'Ollama)
  if (provider === 'openai') {
    try {
      const result = await generateEmbeddingWithOpenAI(text)
      await setCachedEmbedding(text, result.embedding, result.provider)
      return result
    } catch (error) {
      throw new Error(
        `Impossible de générer l'embedding OpenAI : ${error instanceof Error ? error.message : error}`
      )
    }
  }

  throw new Error(
    'Service d\'embeddings non configuré. ' +
    'Activez Ollama avec OLLAMA_ENABLED=true ou configurez OPENAI_API_KEY.'
  )
}

/**
 * Génère des embeddings pour plusieurs textes en batch
 * Même logique fallback/turbo que generateEmbedding().
 *
 * En mode turbo, OpenAI traite le batch nativement (très rapide).
 * En mode normal, Ollama puis fallback OpenAI si circuit breaker OPEN.
 *
 * @param texts - Liste de textes à encoder
 * @param options - Options (forceTurbo pour utiliser OpenAI directement)
 * @returns Liste de vecteurs embeddings
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  options?: EmbeddingOptions
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0, provider: 'ollama' }
  }

  const turbo = options?.forceTurbo || EMBEDDING_TURBO_CONFIG.enabled
  const provider = getEmbeddingProvider()
  const fallbackProvider = getEmbeddingFallbackProvider()

  // Mode turbo : OpenAI batch natif (très rapide)
  if (turbo && aiConfig.openai.apiKey) {
    try {
      const result = await generateEmbeddingsBatchWithOpenAI(texts)
      console.log(`[Embeddings] Turbo batch: ${texts.length} textes en une requête OpenAI`)
      return result
    } catch (error) {
      console.error('[Embeddings] Erreur OpenAI turbo batch:', error instanceof Error ? error.message : error)
      // Fallback Ollama si turbo échoue
      if (provider === 'ollama' && canCallOllama()) {
        try {
          const result = await generateEmbeddingsBatchWithOllama(texts)
          recordOllamaSuccess()
          return result
        } catch (ollamaError) {
          recordOllamaFailure()
          throw new Error(
            `Embeddings batch indisponibles (OpenAI et Ollama en échec). ` +
            `OpenAI: ${error instanceof Error ? error.message : error}. ` +
            `Ollama: ${ollamaError instanceof Error ? ollamaError.message : ollamaError}`
          )
        }
      }
      throw error
    }
  }

  // Mode normal : Ollama prioritaire
  if (provider === 'ollama') {
    if (canCallOllama()) {
      try {
        const result = await generateEmbeddingsBatchWithOllama(texts)
        recordOllamaSuccess()
        return result
      } catch (error) {
        recordOllamaFailure()
        // Fallback OpenAI
        if (fallbackProvider === 'openai') {
          console.log('[Embeddings] Ollama batch en échec, fallback vers OpenAI')
          try {
            return await generateEmbeddingsBatchWithOpenAI(texts)
          } catch (openaiError) {
            throw new Error(
              `Embeddings batch indisponibles (Ollama et OpenAI en échec). ` +
              `Ollama: ${error instanceof Error ? error.message : error}. ` +
              `OpenAI: ${openaiError instanceof Error ? openaiError.message : openaiError}`
            )
          }
        }
        throw new Error(
          `Impossible de générer les embeddings batch : ${error instanceof Error ? error.message : error}. ` +
          `Vérifiez qu'Ollama est démarré ("ollama serve") et que le modèle "${aiConfig.ollama.embeddingModel}" est disponible.`
        )
      }
    }

    // Circuit breaker OPEN : fallback OpenAI
    if (fallbackProvider === 'openai') {
      console.log('[Embeddings] Circuit breaker OPEN, fallback batch vers OpenAI')
      return await generateEmbeddingsBatchWithOpenAI(texts)
    }

    const cbState = getCircuitBreakerState()
    const resetIn = Math.ceil((CIRCUIT_BREAKER_CONFIG.resetTimeout - cbState.lastFailureAgo!) / 1000)
    throw new Error(
      `Service d'embeddings indisponible (circuit breaker OPEN). ` +
      `Réessayez dans ${resetIn}s. Vérifiez "ollama serve" et le modèle "${aiConfig.ollama.embeddingModel}".`
    )
  }

  // Provider OpenAI seul
  if (provider === 'openai') {
    return await generateEmbeddingsBatchWithOpenAI(texts)
  }

  throw new Error(
    'Service d\'embeddings non configuré. ' +
    'Activez Ollama avec OLLAMA_ENABLED=true ou configurez OPENAI_API_KEY.'
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

// Dimensions attendues par provider (les deux produisent 1024-dim)
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
  turboMode: boolean
  fallback: 'openai' | null
} {
  const provider = getEmbeddingProvider()
  const fallback = getEmbeddingFallbackProvider()

  if (provider === 'ollama') {
    return {
      provider: 'ollama',
      model: aiConfig.ollama.embeddingModel,
      dimensions: aiConfig.ollama.embeddingDimensions,
      cost: 'free',
      turboMode: EMBEDDING_TURBO_CONFIG.enabled,
      fallback,
    }
  }

  if (provider === 'openai') {
    return {
      provider: 'openai',
      model: aiConfig.openai.embeddingModel,
      dimensions: aiConfig.openai.embeddingDimensions,
      cost: 'paid',
      turboMode: EMBEDDING_TURBO_CONFIG.enabled,
      fallback: null,
    }
  }

  return {
    provider: null,
    model: 'none',
    dimensions: 0,
    cost: 'free',
    turboMode: false,
    fallback: null,
  }
}
