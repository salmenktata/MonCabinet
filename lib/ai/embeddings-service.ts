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
  provider: 'ollama' | 'openai' | 'gemini'
}

export interface BatchEmbeddingResult {
  embeddings: number[][]
  totalTokens: number
  provider: 'ollama' | 'openai' | 'gemini'
}

export interface EmbeddingOptions {
  forceTurbo?: boolean
  /** Type d'opération pour utiliser la configuration spécifique */
  operationName?: OperationName
  /** Force Ollama même en production (pour dual-provider search sur chunks legacy 1024-dim) */
  forceOllama?: boolean
  /** Force Gemini (text-embedding-004, 768-dim) pour triple-provider search */
  forceGemini?: boolean
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
function resolveEmbeddingProvider(options?: EmbeddingOptions): 'ollama' | 'openai' | 'gemini' {
  // Force Gemini explicitement (triple-provider search : chunks 768-dim)
  if (options?.forceGemini && aiConfig.gemini.apiKey) return 'gemini'

  // Force Ollama explicitement (dual-provider search : chunks legacy 1024-dim)
  if (options?.forceOllama && aiConfig.ollama.enabled) return 'ollama'

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
        prompt: text.substring(0, 2000),
        keep_alive: '60m',
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

  // Retry avec réduction progressive si dépassement token limit
  let input = text
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await client.embeddings.create({
        model: aiConfig.openai.embeddingModel,
        input,
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
    } catch (error: unknown) {
      const isTokenOverflow = error instanceof Error && error.message?.includes('maximum context length')
      if (isTokenOverflow && attempt < 2) {
        // Réduire de 30% à chaque tentative
        input = input.substring(0, Math.floor(input.length * 0.7))
        console.warn(`[Embeddings] Token overflow OpenAI, retry avec ${input.length} chars (tentative ${attempt + 2}/3)`)
        continue
      }
      throw error
    }
  }

  throw new Error('Unreachable')
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
    let batch = texts.slice(i, i + MAX_BATCH)

    // Retry avec réduction progressive si dépassement token limit
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
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
        break
      } catch (error: unknown) {
        const isTokenOverflow = error instanceof Error && error.message?.includes('maximum context length')
        if (isTokenOverflow && attempt < 2) {
          // Réduire chaque texte de 30%
          batch = batch.map(t => t.substring(0, Math.floor(t.length * 0.7)))
          console.warn(`[Embeddings] Token overflow batch OpenAI, retry avec textes réduits (tentative ${attempt + 2}/3)`)
          continue
        }
        throw error
      }
    }
  }

  return { embeddings: allEmbeddings, totalTokens, provider: 'openai' }
}

// =============================================================================
// GEMINI EMBEDDINGS (text-embedding-004, 768-dim)
// =============================================================================

async function generateEmbeddingsBatchWithGemini(
  texts: string[]
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0, provider: 'gemini' }
  }

  // Gemini n'a pas de batch natif — appels parallèles avec concurrence 5 (rate limit 1500/min)
  const CONCURRENCY = 5
  const allEmbeddings: number[][] = []

  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const batch = texts.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map((text) => generateEmbeddingWithGemini(text)))
    for (const r of results) {
      allEmbeddings.push(r.embedding)
    }
  }

  return { embeddings: allEmbeddings, totalTokens: 0, provider: 'gemini' }
}

async function generateEmbeddingWithGemini(text: string): Promise<EmbeddingResult> {
  if (!aiConfig.gemini.apiKey) {
    throw new Error('Gemini API key non configurée (GOOGLE_API_KEY)')
  }

  // Utiliser l'API REST v1 (text-embedding-004 requis sur v1, v1beta = deprecated)
  // Clé API dans le header x-goog-api-key (évite l'exposition dans les logs HTTP/Nginx)
  const model = aiConfig.gemini.embeddingModel
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:embedContent`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': aiConfig.gemini.apiKey,
    },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text: text.substring(0, 8000) }] },
      outputDimensionality: aiConfig.gemini.embeddingDimensions,
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini embedding API error: ${response.status} — ${errorText.substring(0, 200)}`)
  }

  const data = await response.json() as { embedding: { values: number[] } }
  const embedding = data.embedding?.values

  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('Gemini embedContent a retourné un embedding invalide')
  }

  const validation = validateEmbedding(embedding, 'gemini')
  if (!validation.valid) {
    throw new Error(`Embedding Gemini invalide: ${validation.error}`)
  }

  // Tracking coûts asynchrone (non bloquant)
  const { trackGeminiEmbeddingCost } = await import('./gemini-client')
  void trackGeminiEmbeddingCost(Math.min(text.length, 8000))

  return {
    embedding,
    tokenCount: countTokens(text),
    provider: 'gemini',
  }
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
  // Tronquer si le texte dépasse la limite du modèle d'embedding.
  // text-embedding-3-small : 8191 tokens max (~24 000 chars arabe, ~32 000 chars français)
  // Ollama qwen3-embedding : 2000 chars max (fenêtre contextuelle limitée du modèle)
  // Gemini embedding-001 : 8000 chars (cf. generateEmbeddingWithGemini)
  // On utilise 6000 comme dénominateur commun conservateur pour tous les providers.
  const MAX_EMBEDDING_CHARS = 6000
  if (text.length > MAX_EMBEDDING_CHARS) {
    text = text.substring(0, MAX_EMBEDDING_CHARS)
  }

  // Résoudre le provider AVANT la vérification cache
  // (sinon forceOllama/forceGemini ignorés : cache retourne embedding du mauvais provider)
  const provider = resolveEmbeddingProvider(options)

  // Vérifier le cache avec le provider résolu (clé = emb:{provider}:{hash})
  const cached = await getCachedEmbedding(text, provider)
  if (cached) {
    return {
      embedding: cached.embedding,
      tokenCount: countTokens(text),
      provider: cached.provider as 'ollama' | 'openai' | 'gemini',
    }
  }

  let result: EmbeddingResult
  if (provider === 'openai') {
    result = await generateEmbeddingWithOpenAI(text)
  } else if (provider === 'gemini') {
    result = await generateEmbeddingWithGemini(text)
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
  const MAX_EMBEDDING_CHARS = 3500
  texts = texts.map(t => t.length > MAX_EMBEDDING_CHARS ? t.substring(0, MAX_EMBEDDING_CHARS) : t)

  const provider = resolveEmbeddingProvider(options)

  // Forçage explicite (ex: backfill Gemini/Ollama) — pas de fallback
  if (options?.forceGemini) return await generateEmbeddingsBatchWithGemini(texts)
  if (options?.forceOllama) return await generateEmbeddingsBatchWithOllama(texts)

  // Fallback en cascade : OpenAI → Gemini → Ollama
  if (provider === 'openai' || provider === 'gemini') {
    // Essai OpenAI en premier (production)
    if (aiConfig.openai.apiKey) {
      try {
        return await generateEmbeddingsBatchWithOpenAI(texts)
      } catch (error) {
        console.warn(`[Embeddings] OpenAI batch échoué, fallback Gemini: ${error instanceof Error ? error.message : error}`)
      }
    }

    // Fallback Gemini
    if (aiConfig.gemini.apiKey) {
      try {
        return await generateEmbeddingsBatchWithGemini(texts)
      } catch (error) {
        console.warn(`[Embeddings] Gemini batch échoué, fallback Ollama: ${error instanceof Error ? error.message : error}`)
      }
    }
  }

  // Fallback final Ollama (dev ou dernier recours)
  return await generateEmbeddingsBatchWithOllama(texts)
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
  gemini: aiConfig.gemini.embeddingDimensions,
}

export function validateEmbedding(
  embedding: number[],
  provider: 'ollama' | 'openai' | 'gemini'
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
  return aiConfig.ollama.enabled || !!aiConfig.openai.apiKey || !!aiConfig.gemini.apiKey
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
  provider: 'ollama' | 'openai' | 'gemini' | null
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
      fallback: null,
    }
  }

  if (provider === 'gemini') {
    return {
      provider: 'gemini',
      model: aiConfig.gemini.embeddingModel,
      dimensions: aiConfig.gemini.embeddingDimensions,
      cost: 'free',
      turboMode: EMBEDDING_TURBO_CONFIG.enabled,
      fallback: null,
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
