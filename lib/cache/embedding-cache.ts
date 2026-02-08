/**
 * Cache Redis pour les embeddings
 *
 * Évite de régénérer des embeddings pour les mêmes textes.
 * TTL: 7 jours par défaut.
 */

import {
  getRedisClient,
  isRedisAvailable,
  hashKey,
  REDIS_KEYS,
  CACHE_TTL,
} from './redis'
import { getEmbeddingProvider, getEmbeddingDimensions } from '@/lib/ai/config'

// =============================================================================
// TYPES
// =============================================================================

interface CachedEmbedding {
  embedding: number[]
  provider: 'ollama' | 'openai'
  createdAt: number
}

// =============================================================================
// CACHE EMBEDDINGS
// =============================================================================

/**
 * Génère une clé de cache versionnée par provider+dimensions
 * Évite de retourner un embedding Ollama (1024-dim) quand on utilise OpenAI (1536-dim)
 */
function getVersionedCacheKey(textHash: string): string {
  const provider = getEmbeddingProvider() || 'unknown'
  const dimensions = getEmbeddingDimensions()
  return REDIS_KEYS.embedding(`${provider}:${dimensions}:${textHash}`)
}

/**
 * Récupère un embedding du cache
 * Le cache est versionné par provider+dimensions pour éviter les conflits
 * @param text - Texte original
 * @returns Embedding si trouvé, null sinon
 */
export async function getCachedEmbedding(
  text: string
): Promise<CachedEmbedding | null> {
  if (!isRedisAvailable()) {
    return null
  }

  try {
    const client = await getRedisClient()
    if (!client) return null

    const hash = await hashKey(text)
    const key = getVersionedCacheKey(hash)
    const cached = await client.get(key)

    if (cached) {
      console.log(`[EmbeddingCache] HIT: ${hash.substring(0, 8)}...`)
      return JSON.parse(cached) as CachedEmbedding
    }

    return null
  } catch (error) {
    console.warn(
      '[EmbeddingCache] Erreur lecture:',
      error instanceof Error ? error.message : error
    )
    return null
  }
}

/**
 * Stocke un embedding dans le cache
 * Le cache est versionné par provider+dimensions pour éviter les conflits
 * @param text - Texte original
 * @param embedding - Vecteur embedding
 * @param provider - Provider utilisé
 */
export async function setCachedEmbedding(
  text: string,
  embedding: number[],
  provider: 'ollama' | 'openai'
): Promise<void> {
  if (!isRedisAvailable()) {
    return
  }

  try {
    const client = await getRedisClient()
    if (!client) return

    const hash = await hashKey(text)
    const key = getVersionedCacheKey(hash)

    const data: CachedEmbedding = {
      embedding,
      provider,
      createdAt: Date.now(),
    }

    await client.setEx(key, CACHE_TTL.embedding, JSON.stringify(data))
    console.log(`[EmbeddingCache] SET: ${hash.substring(0, 8)}... (TTL: ${CACHE_TTL.embedding}s)`)
  } catch (error) {
    console.warn(
      '[EmbeddingCache] Erreur écriture:',
      error instanceof Error ? error.message : error
    )
  }
}

/**
 * Invalide un embedding du cache
 */
export async function invalidateCachedEmbedding(text: string): Promise<void> {
  if (!isRedisAvailable()) {
    return
  }

  try {
    const client = await getRedisClient()
    if (!client) return

    const hash = await hashKey(text)
    const key = getVersionedCacheKey(hash)
    await client.del(key)
    console.log(`[EmbeddingCache] DEL: ${hash.substring(0, 8)}...`)
  } catch (error) {
    console.warn(
      '[EmbeddingCache] Erreur suppression:',
      error instanceof Error ? error.message : error
    )
  }
}

/**
 * Statistiques du cache embeddings
 */
export async function getEmbeddingCacheStats(): Promise<{
  available: boolean
  keyCount?: number
}> {
  if (!isRedisAvailable()) {
    return { available: false }
  }

  try {
    const client = await getRedisClient()
    if (!client) return { available: false }

    // Compter les clés d'embedding
    const keys = await client.keys('emb:*')
    return {
      available: true,
      keyCount: keys.length,
    }
  } catch {
    return { available: false }
  }
}
