/**
 * Service de génération d'embeddings - Mode No-Fallback
 *
 * Production: OpenAI text-embedding-3-small (1536-dim) uniquement
 * Développement: Ollama qwen3-embedding:0.6b (1024-dim) uniquement
 *
 * Pas de fallback ni circuit breaker. Si le provider échoue → throw.
 * Avec cache Redis pour éviter les régénérations inutiles.
 *
 * Configuration définitive RAG Haute Qualité (Février 2026)
 */

import OpenAI from 'openai'
import { aiConfig, EMBEDDING_TURBO_CONFIG } from './config'
import { getCachedEmbedding, setCachedEmbedding } from '@/lib/cache/embedding-cache'
import { countTokens } from './token-utils'
import { getOperationConfig, type OperationName } from './operations-config'

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
  /** Type d'opération pour utiliser la configuration spécifique */
  operationName?: OperationName
}

interface OllamaEmbeddingResponse {
  embedding: number[]
}

// =============================================================================
// DÉTERMINATION DU PROVIDER
// =============================================================================

const isDev = process.env.NODE_ENV === 'development'

/**
 * Détermine le provider d'embeddings pour une opération donnée
 */
function resolveEmbeddingProvider(options?: EmbeddingOptions): 'ollama' | 'openai' {
  // Si opération spécifiée, utiliser sa config
  if (options?.operationName) {
    const opConfig = getOperationConfig(options.operationName)
    if (opConfig.embeddings) {
      return opConfig.embeddings.provider
    }
  }

  // Dev → Ollama, Prod → OpenAI
  if (isDev && aiConfig.ollama.enabled) return 'ollama'
  if (aiConfig.openai.apiKey) return 'openai'
  if (aiConfig.ollama.enabled) return 'ollama'

  throw new Error(
    'Service d\'embeddings non configuré. Configurez OPENAI_API_KEY (prod) ou OLLAMA_ENABLED=true (dev).'
  )
}

// =============================================================================
// OLLAMA EMBEDDINGS (dev uniquement)
// =============================================================================

const OLLAMA_TIMEOUT_MS = 120000

async function generateEmbeddingWithOllama(text: string): Promise<EmbeddingResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS)

  try {
    const response = await fetch(`${aiConfig.ollama.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: aiConfig.ollama.embeddingModel,
        prompt: text.substring(0, 6500),
        keep_alive: '10m',
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ollama embedding error: ${response.status} - ${errorText}`)
    }

    const data = await response.json() as OllamaEmbeddingResponse

    const validation = validateEmbedding(data.embedding, 'ollama')
    if (!validation.valid) {
      throw new Error(`Embedding Ollama invalide: ${validation.error}`)
    }

    return {
      embedding: data.embedding,
      tokenCount: countTokens(text),
      provider: 'ollama',
    }
  } catch (error) {
    clearTimeout(timeoutId)

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

async function generateEmbeddingsBatchWithOllama(
  texts: string[]
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0, provider: 'ollama' }
  }

  const concurrency = parseInt(process.env.OLLAMA_EMBEDDING_CONCURRENCY || '2', 10)
  const allEmbeddings: number[][] = []
  let totalTokens = 0

  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map((text) => generateEmbeddingWithOllama(text))
    )

    for (const result of batchResults) {
      allEmbeddings.push(result.embedding)
      totalTokens += result.tokenCount
    }
  }

  return { embeddings: allEmbeddings, totalTokens, provider: 'ollama' }
}

// =============================================================================
// OPENAI EMBEDDINGS (prod)
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

async function generateEmbeddingWithOpenAI(text: string): Promise<EmbeddingResult> {
  const client = getOpenAIClient()

  const response = await client.embeddings.create({
    model: aiConfig.openai.embeddingModel,
    input: text.substring(0, 6500),
    dimensions: aiConfig.openai.embeddingDimensions,
  })

  const embedding = response.data[0].embedding

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

async function generateEmbeddingsBatchWithOpenAI(
  texts: string[]
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0, provider: 'openai' }
  }

  const client = getOpenAIClient()
  const MAX_BATCH = 2048
  const allEmbeddings: number[][] = []
  let totalTokens = 0

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH).map(t => t.substring(0, 6500))

    const response = await client.embeddings.create({
      model: aiConfig.openai.embeddingModel,
      input: batch,
      dimensions: aiConfig.openai.embeddingDimensions,
    })

    const sorted = response.data.sort((a, b) => a.index - b.index)
    for (const item of sorted) {
      allEmbeddings.push(item.embedding)
    }
    totalTokens += response.usage.total_tokens
  }

  return { embeddings: allEmbeddings, totalTokens, provider: 'openai' }
}

// =============================================================================
// FONCTIONS PRINCIPALES (no-fallback, provider unique)
// =============================================================================

/**
 * Génère un embedding pour un texte unique.
 * Provider déterminé par l'opération : OpenAI (prod) ou Ollama (dev).
 * Pas de fallback. Avec cache Redis.
 */
export async function generateEmbedding(
  text: string,
  options?: EmbeddingOptions
): Promise<EmbeddingResult> {
  // Tronquer si le texte dépasse la limite du modèle d'embedding (~6000 chars pour 8192 tokens arabe)
  const MAX_EMBEDDING_CHARS = 6000
  if (text.length > MAX_EMBEDDING_CHARS) {
    text = text.substring(0, MAX_EMBEDDING_CHARS)
  }

  // Vérifier le cache
  const cached = await getCachedEmbedding(text)
  if (cached) {
    return {
      embedding: cached.embedding,
      tokenCount: countTokens(text),
      provider: cached.provider as 'ollama' | 'openai',
    }
  }

  const provider = resolveEmbeddingProvider(options)

  let result: EmbeddingResult
  if (provider === 'openai') {
    result = await generateEmbeddingWithOpenAI(text)
  } else {
    result = await generateEmbeddingWithOllama(text)
  }

  await setCachedEmbedding(text, result.embedding, result.provider)
  return result
}

/**
 * Génère des embeddings pour plusieurs textes en batch.
 * Provider déterminé par l'opération : OpenAI batch natif (prod) ou Ollama parallèle (dev).
 * Pas de fallback.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  options?: EmbeddingOptions
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0, provider: 'openai' }
  }

  // Tronquer les textes trop longs pour le modèle d'embedding
  const MAX_EMBEDDING_CHARS = 6000
  texts = texts.map(t => t.length > MAX_EMBEDDING_CHARS ? t.substring(0, MAX_EMBEDDING_CHARS) : t)

  const provider = resolveEmbeddingProvider(options)

  if (provider === 'openai') {
    return await generateEmbeddingsBatchWithOpenAI(texts)
  } else {
    return await generateEmbeddingsBatchWithOllama(texts)
  }
}

// =============================================================================
// SIMILARITÉ ET FORMAT
// =============================================================================

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

export function formatEmbeddingForPostgres(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

export function parseEmbeddingFromPostgres(pgVector: string): number[] {
  const cleaned = pgVector.replace(/[\[\]\(\)]/g, '')
  return cleaned.split(',').map((s) => parseFloat(s.trim()))
}

// =============================================================================
// VALIDATION DES EMBEDDINGS
// =============================================================================

const EXPECTED_DIMENSIONS: Record<string, number> = {
  ollama: aiConfig.ollama.embeddingDimensions,
  openai: aiConfig.openai.embeddingDimensions,
}

export function validateEmbedding(
  embedding: number[],
  provider: 'ollama' | 'openai'
): { valid: boolean; error?: string } {
  if (!embedding || !Array.isArray(embedding)) {
    return { valid: false, error: 'Embedding null ou non-tableau' }
  }

  const expectedDim = EXPECTED_DIMENSIONS[provider]
  if (embedding.length !== expectedDim) {
    return {
      valid: false,
      error: `Dimensions incorrectes: ${embedding.length} (attendu: ${expectedDim} pour ${provider}). ` +
        `Vecteur incompatible avec la colonne vector(${expectedDim}).`,
    }
  }

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

  const norm = Math.sqrt(normSquared)
  if (norm < 0.5) {
    return {
      valid: false,
      error: `Embedding norme trop faible: ${norm.toFixed(4)} (minimum: 0.5). ` +
        `Similarité cosinus non fiable avec un vecteur quasi-nul.`,
    }
  }

  if (norm > 100) {
    console.warn(`[Embeddings] Norme inhabituellement élevée: ${norm.toFixed(4)}`)
  }

  return { valid: true }
}

// =============================================================================
// UTILITAIRES
// =============================================================================

export { countTokens, estimateTokenCount } from './token-utils'

export function isEmbeddingsServiceAvailable(): boolean {
  return aiConfig.ollama.enabled || !!aiConfig.openai.apiKey
}

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

export function getEmbeddingProviderInfo(): {
  provider: 'ollama' | 'openai' | null
  model: string
  dimensions: number
  cost: 'free' | 'paid'
  turboMode: boolean
  fallback: 'openai' | null
} {
  const provider = resolveEmbeddingProvider()

  if (provider === 'ollama') {
    return {
      provider: 'ollama',
      model: aiConfig.ollama.embeddingModel,
      dimensions: aiConfig.ollama.embeddingDimensions,
      cost: 'free',
      turboMode: EMBEDDING_TURBO_CONFIG.enabled,
      fallback: null, // No fallback in no-fallback mode
    }
  }

  return {
    provider: 'openai',
    model: aiConfig.openai.embeddingModel,
    dimensions: aiConfig.openai.embeddingDimensions,
    cost: 'paid',
    turboMode: EMBEDDING_TURBO_CONFIG.enabled,
    fallback: null,
  }
}

// =============================================================================
// RÉTROCOMPATIBILITÉ (stubs pour API routes existantes)
// =============================================================================

/**
 * @deprecated Circuit breaker supprimé en mode no-fallback.
 * Retourne un état statique pour compatibilité API routes.
 */
export function getCircuitBreakerState(): {
  state: string
  failures: number
  lastFailureAgo: number | null
  halfOpenInFlight: number
  config: { failureThreshold: number; resetTimeout: number; successThreshold: number; halfOpenMaxConcurrent: number }
} {
  return {
    state: 'DISABLED',
    failures: 0,
    lastFailureAgo: null,
    halfOpenInFlight: 0,
    config: { failureThreshold: 0, resetTimeout: 0, successThreshold: 0, halfOpenMaxConcurrent: 0 },
  }
}

/**
 * @deprecated Circuit breaker supprimé en mode no-fallback. No-op.
 */
export function resetCircuitBreaker(): void {
  console.log('[Embeddings] Circuit breaker désactivé (mode no-fallback)')
}
