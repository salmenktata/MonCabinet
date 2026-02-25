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
import { getEmbeddingDimensions } from '@/lib/ai/config'

// =============================================================================
// TYPES
// =============================================================================

interface CachedEmbedding {
  embedding: number[]
  provider: 'ollama' | 'openai' | 'gemini'
  createdAt: number
}

// =============================================================================
// CACHE EMBEDDINGS
// =============================================================================

/**
 * Génère une clé de cache versionnée par provider.
 * Chaque provider (openai 1536-dim, ollama 768-dim nomic, gemini 768-dim) a
 * son propre espace de cache car les embeddings NE SONT PAS interchangeables.
 * Un embedding OpenAI 1536-dim ne peut pas être utilisé là où 768-dim est attendu.
 */
function getVersionedCacheKey(textHash: string, provider: 'ollama' | 'openai' | 'gemini'): string {
  return REDIS_KEYS.embedding(`${provider}:${textHash}`)
}

/**
 * Récupère un embedding du cache pour un provider spécifique
 * @param text - Texte original
 * @param provider - Provider requis (si null: accepte n'importe quel provider pour backward compat)
 * @returns Embedding si trouvé pour ce provider, null sinon
 */
export async function getCachedEmbedding(
  text: string,
  provider?: 'ollama' | 'openai' | 'gemini'
): Promise<CachedEmbedding | null> {
  if (!isRedisAvailable()) {
    return null
  }

  try {
    const client = await getRedisClient()
    if (!client) return null

    const hash = await hashKey(text)

    if (provider) {
      // Clé spécifique au provider (nouveau format)
      const key = getVersionedCacheKey(hash, provider)
      const cached = await client.get(key)
      if (cached) {
        console.log(`[EmbeddingCache] HIT: ${hash.substring(0, 8)}... (${provider})`)
        return JSON.parse(cached) as CachedEmbedding
      }
      return null
    }

    // Backward compat: essayer dans l'ordre openai → ollama → gemini
    for (const p of ['openai', 'ollama', 'gemini'] as const) {
      const key = getVersionedCacheKey(hash, p)
      const cached = await client.get(key)
      if (cached) {
        console.log(`[EmbeddingCache] HIT: ${hash.substring(0, 8)}... (${p})`)
        return JSON.parse(cached) as CachedEmbedding
      }
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
 * Stocke un embedding dans le cache avec clé spécifique au provider
 * @param text - Texte original
 * @param embedding - Vecteur embedding
 * @param provider - Provider utilisé (détermine la clé de cache)
 */
export async function setCachedEmbedding(
  text: string,
  embedding: number[],
  provider: 'ollama' | 'openai' | 'gemini'
): Promise<void> {
  if (!isRedisAvailable()) {
    return
  }

  try {
    const client = await getRedisClient()
    if (!client) return

    const hash = await hashKey(text)
    const key = getVersionedCacheKey(hash, provider)

    const data: CachedEmbedding = {
      embedding,
      provider,
      createdAt: Date.now(),
    }

    await client.setEx(key, CACHE_TTL.embedding, JSON.stringify(data))
    console.log(`[EmbeddingCache] SET: ${hash.substring(0, 8)}... (${provider}, TTL: ${CACHE_TTL.embedding}s)`)
  } catch (error) {
    console.warn(
      '[EmbeddingCache] Erreur écriture:',
      error instanceof Error ? error.message : error
    )
  }
}

/**
 * Invalide un embedding du cache (tous providers)
 */
export async function invalidateCachedEmbedding(text: string): Promise<void> {
  if (!isRedisAvailable()) {
    return
  }

  try {
    const client = await getRedisClient()
    if (!client) return

    const hash = await hashKey(text)
    const keys = (['openai', 'ollama', 'gemini'] as const).map(p => getVersionedCacheKey(hash, p))
    await client.del(keys)
    console.log(`[EmbeddingCache] DEL: ${hash.substring(0, 8)}... (tous providers)`)
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
