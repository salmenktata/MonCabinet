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
import { encode } from 'gpt-tokenizer'

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

/**
 * Génère un embedding via Ollama (local, gratuit)
 */
async function generateEmbeddingWithOllama(text: string): Promise<EmbeddingResult> {
  const response = await fetch(`${aiConfig.ollama.baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: aiConfig.ollama.embeddingModel,
      prompt: text.substring(0, 30000), // Tronquer si trop long
    }),
  })

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
  // Mais on va faire des requêtes parallèles pour éviter les timeouts sur de gros batches
  const batchSize = 10
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
    try {
      result = await generateEmbeddingWithOllama(text)
    } catch (error) {
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
 * @param texts - Liste de textes à encoder
 * @returns Liste de vecteurs embeddings
 */
export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<BatchEmbeddingResult> {
  const provider = getEmbeddingProvider()

  if (provider === 'ollama') {
    try {
      return await generateEmbeddingsBatchWithOllama(texts)
    } catch (error) {
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

  // Vérifier les dimensions
  const expectedDim = EXPECTED_DIMENSIONS[provider]
  if (embedding.length !== expectedDim) {
    console.warn(
      `[Embeddings] Dimensions inattendues: ${embedding.length} (attendu: ${expectedDim})`
    )
    // On ne bloque pas, juste un warning car les modèles peuvent varier
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

  // Vérifier que la norme n'est pas nulle (vecteur nul = inutile)
  const norm = Math.sqrt(normSquared)
  if (norm === 0) {
    return { valid: false, error: 'Embedding norme nulle (vecteur nul)' }
  }

  // Vérifier que la norme est raisonnable (typiquement proche de 1 pour embeddings normalisés)
  if (norm < 0.1 || norm > 100) {
    console.warn(`[Embeddings] Norme inhabituelle: ${norm.toFixed(4)}`)
  }

  return { valid: true }
}

// =============================================================================
// UTILITAIRES
// =============================================================================

/**
 * Compte le nombre de tokens dans un texte de manière précise
 * Utilise gpt-tokenizer pour un comptage exact compatible GPT-4/Claude
 */
export function countTokens(text: string): number {
  try {
    return encode(text).length
  } catch {
    // Fallback si erreur d'encodage (caractères spéciaux)
    return Math.ceil(text.length / 4)
  }
}

/**
 * @deprecated Utiliser countTokens à la place
 */
export function estimateTokenCount(text: string): number {
  return countTokens(text)
}

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
