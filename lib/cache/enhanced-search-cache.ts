/**
 * Cache Multi-Niveaux pour Recherche RAG (Phase 2.3)
 *
 * Architecture 3 niveaux :
 * - L1 (Exact Match) : Hash query → TTL 1h, <10ms
 * - L2 (Semantic) : Embedding similarity >0.85 → TTL 6h, <50ms (réutilise search-cache.ts)
 * - L3 (Partial) : Chunks par domaine → TTL 24h, <100ms
 *
 * Objectif : 60% cache hit rate combiné (L1+L2+L3)
 *
 * @module lib/cache/enhanced-search-cache
 */

import {
  getRedisClient,
  isRedisAvailable,
  hashKey,
  REDIS_KEYS,
  SEARCH_CACHE_THRESHOLD,
} from './redis'
import {
  getCachedSearchResults as getSemanticCachedResults,
  setCachedSearchResults as setSemanticCachedResults,
  type SearchScope,
} from './search-cache'
import { cosineSimilarity } from '@/lib/ai/embeddings-service'

// =============================================================================
// TYPES
// =============================================================================

export interface EnhancedSearchQuery {
  query: string
  embedding: number[]
  category?: string
  language?: string
  domain?: string
  scope: SearchScope
}

export interface CachedSearchResult {
  results: unknown[]
  metadata: {
    level: 'L1' | 'L2' | 'L3'
    hitRate?: number
    timestamp: number
  }
}

interface L1CacheEntry {
  results: unknown[]
  embedding: number[]
  createdAt: number
}

interface L3CacheEntry {
  chunks: unknown[]
  domain: string
  createdAt: number
  count: number
}

// =============================================================================
// Configuration Cache
// =============================================================================

const CACHE_TTL = {
  L1: 3600, // 1 heure (exact match)
  L2: 21600, // 6 heures (semantic similarity via search-cache.ts)
  L3: 86400, // 24 heures (partial results par domaine)
}

const CACHE_CONFIG = {
  L1_MAX_ENTRIES_PER_SCOPE: 50,
  L3_MAX_CHUNKS_PER_DOMAIN: 200,
  L3_SIMILARITY_THRESHOLD: 0.70, // Plus permissif que L2 (0.85)
}

// =============================================================================
// L1 CACHE : EXACT MATCH
// =============================================================================

/**
 * Génère une clé L1 (hash exact de la query)
 */
function getL1Key(query: string, scope: SearchScope): string {
  const scopeKey = scope.dossierId
    ? `u:${scope.userId}:d:${scope.dossierId}`
    : `u:${scope.userId}`
  const queryHash = hashKey(query.toLowerCase().trim())
  return `search_l1:${scopeKey}:${queryHash}`
}

/**
 * Récupère résultats depuis L1 (exact match)
 */
async function getL1CachedResults(
  query: string,
  scope: SearchScope
): Promise<unknown[] | null> {
  if (!isRedisAvailable()) return null

  try {
    const client = await getRedisClient()
    if (!client) return null

    const key = await getL1Key(query, scope)
    const cached = await client.get(key)

    if (!cached) return null

    const entry = JSON.parse(cached) as L1CacheEntry
    console.log(`[EnhancedCache] L1 HIT (exact match) - query="${query.substring(0, 50)}..."`)

    return entry.results
  } catch (error) {
    console.warn('[EnhancedCache] L1 erreur lecture:', error)
    return null
  }
}

/**
 * Stocke résultats dans L1 (exact match)
 */
async function setL1CachedResults(
  query: string,
  embedding: number[],
  results: unknown[],
  scope: SearchScope
): Promise<void> {
  if (!isRedisAvailable()) return

  try {
    const client = await getRedisClient()
    if (!client) return

    const key = await getL1Key(query, scope)
    const entry: L1CacheEntry = {
      results,
      embedding,
      createdAt: Date.now(),
    }

    await client.setEx(key, CACHE_TTL.L1, JSON.stringify(entry))

    // Gérer limite max entrées par scope (LRU simple via TTL)
    const scopeKey = scope.dossierId
      ? `u:${scope.userId}:d:${scope.dossierId}`
      : `u:${scope.userId}`
    const indexKey = `search_l1_idx:${scopeKey}`
    await client.sAdd(indexKey, key)
    await client.expire(indexKey, CACHE_TTL.L1 * 2)

    const indexSize = await client.sCard(indexKey)
    if (indexSize > CACHE_CONFIG.L1_MAX_ENTRIES_PER_SCOPE) {
      // Supprimer anciennes entrées (FIFO approximatif)
      const keys = await client.sMembers(indexKey)
      const toRemove = keys.slice(0, indexSize - CACHE_CONFIG.L1_MAX_ENTRIES_PER_SCOPE)
      for (const oldKey of toRemove) {
        await client.del(oldKey)
        await client.sRem(indexKey, oldKey)
      }
    }

    console.log(
      `[EnhancedCache] L1 SET - query="${query.substring(0, 50)}..." (TTL: ${CACHE_TTL.L1}s)`
    )
  } catch (error) {
    console.warn('[EnhancedCache] L1 erreur écriture:', error)
  }
}

// =============================================================================
// L2 CACHE : SEMANTIC SIMILARITY (Délégation vers search-cache.ts)
// =============================================================================

/**
 * Récupère résultats depuis L2 (semantic similarity)
 * Délègue vers search-cache.ts existant avec threshold 0.75-0.85
 */
async function getL2CachedResults(
  embedding: number[],
  scope: SearchScope
): Promise<unknown[] | null> {
  const results = await getSemanticCachedResults(embedding, scope)

  if (results) {
    console.log(`[EnhancedCache] L2 HIT (semantic similarity >=${SEARCH_CACHE_THRESHOLD})`)
  }

  return results
}

/**
 * Stocke résultats dans L2 (semantic similarity)
 * Délègue vers search-cache.ts existant
 */
async function setL2CachedResults(
  embedding: number[],
  results: unknown[],
  scope: SearchScope
): Promise<void> {
  await setSemanticCachedResults(embedding, results, scope)
  console.log(`[EnhancedCache] L2 SET (TTL: ${CACHE_TTL.L2}s via search-cache.ts)`)
}

// =============================================================================
// L3 CACHE : PARTIAL RESULTS (Chunks par Domaine)
// =============================================================================

/**
 * Génère une clé L3 (domaine juridique)
 */
function getL3Key(domain: string, category?: string, language?: string): string {
  const parts = ['search_l3', domain]
  if (category) parts.push(category)
  if (language) parts.push(language)
  return parts.join(':')
}

/**
 * Récupère chunks partiels depuis L3 (domaine)
 */
async function getL3PartialChunks(
  query: EnhancedSearchQuery
): Promise<unknown[] | null> {
  if (!isRedisAvailable() || !query.domain) return null

  try {
    const client = await getRedisClient()
    if (!client) return null

    const key = getL3Key(query.domain, query.category, query.language)
    const cached = await client.get(key)

    if (!cached) return null

    const entry = JSON.parse(cached) as L3CacheEntry

    // Filtrer chunks par similarité avec embedding (threshold plus permissif)
    const relevantChunks: unknown[] = []

    for (const chunk of entry.chunks) {
      // Vérifier si chunk a un embedding
      const chunkData = chunk as { embedding?: number[]; [key: string]: unknown }
      if (!chunkData.embedding) continue

      const similarity = cosineSimilarity(query.embedding, chunkData.embedding)

      if (similarity >= CACHE_CONFIG.L3_SIMILARITY_THRESHOLD) {
        relevantChunks.push(chunk)
      }
    }

    if (relevantChunks.length > 0) {
      console.log(
        `[EnhancedCache] L3 HIT (partial) - domain="${query.domain}", ${relevantChunks.length} chunks relevants`
      )
      return relevantChunks
    }

    return null
  } catch (error) {
    console.warn('[EnhancedCache] L3 erreur lecture:', error)
    return null
  }
}

/**
 * Stocke chunks partiels dans L3 (domaine)
 */
async function setL3PartialChunks(
  domain: string,
  chunks: unknown[],
  category?: string,
  language?: string
): Promise<void> {
  if (!isRedisAvailable() || !domain) return

  try {
    const client = await getRedisClient()
    if (!client) return

    const key = getL3Key(domain, category, language)

    // Limiter nombre de chunks stockés
    const limitedChunks = chunks.slice(0, CACHE_CONFIG.L3_MAX_CHUNKS_PER_DOMAIN)

    const entry: L3CacheEntry = {
      chunks: limitedChunks,
      domain,
      createdAt: Date.now(),
      count: limitedChunks.length,
    }

    await client.setEx(key, CACHE_TTL.L3, JSON.stringify(entry))

    console.log(
      `[EnhancedCache] L3 SET - domain="${domain}", ${limitedChunks.length} chunks (TTL: ${CACHE_TTL.L3}s)`
    )
  } catch (error) {
    console.warn('[EnhancedCache] L3 erreur écriture:', error)
  }
}

// =============================================================================
// FONCTION PRINCIPALE : CACHE MULTI-NIVEAUX
// =============================================================================

/**
 * Récupère résultats depuis cache multi-niveaux (L1 → L2 → L3)
 *
 * @param query - Query complète avec embedding et contexte
 * @returns Résultats + niveau cache, ou null si miss
 *
 * @example
 * ```ts
 * const cached = await getEnhancedCachedResults({
 *   query: 'contrat vente immobilier',
 *   embedding: [0.1, 0.2, ...],
 *   category: 'code',
 *   domain: 'droit_civil',
 *   scope: { userId: '123' }
 * })
 *
 * if (cached) {
 *   console.log(`Cache ${cached.metadata.level} hit`)
 *   return cached.results
 * }
 * ```
 */
export async function getEnhancedCachedResults(
  query: EnhancedSearchQuery
): Promise<CachedSearchResult | null> {
  const startTime = Date.now()

  // Niveau 1 : Exact Match (rapide <10ms)
  const l1Results = await getL1CachedResults(query.query, query.scope)
  if (l1Results) {
    return {
      results: l1Results,
      metadata: {
        level: 'L1',
        hitRate: 1.0,
        timestamp: Date.now() - startTime,
      },
    }
  }

  // Niveau 2 : Semantic Similarity (moyen <50ms)
  const l2Results = await getL2CachedResults(query.embedding, query.scope)
  if (l2Results) {
    return {
      results: l2Results,
      metadata: {
        level: 'L2',
        hitRate: 0.85, // Approximation basée sur threshold
        timestamp: Date.now() - startTime,
      },
    }
  }

  // Niveau 3 : Partial Results (lent <100ms)
  const l3Results = await getL3PartialChunks(query)
  if (l3Results && l3Results.length > 0) {
    return {
      results: l3Results,
      metadata: {
        level: 'L3',
        hitRate: 0.7, // Approximation
        timestamp: Date.now() - startTime,
      },
    }
  }

  // Cache miss total
  return null
}

/**
 * Stocke résultats dans cache multi-niveaux (L1 + L2 + L3)
 *
 * @param query - Query complète avec embedding et contexte
 * @param results - Résultats de recherche à cacher
 */
export async function setEnhancedCachedResults(
  query: EnhancedSearchQuery,
  results: unknown[]
): Promise<void> {
  // Stocker dans les 3 niveaux en parallèle
  const promises: Promise<void>[] = []

  // L1 : Exact match
  promises.push(setL1CachedResults(query.query, query.embedding, results, query.scope))

  // L2 : Semantic similarity (via search-cache.ts)
  promises.push(setL2CachedResults(query.embedding, results, query.scope))

  // L3 : Partial results (si domaine disponible)
  if (query.domain && results.length > 0) {
    promises.push(setL3PartialChunks(query.domain, results, query.category, query.language))
  }

  await Promise.all(promises)

  console.log(
    `[EnhancedCache] SET complet (L1+L2${query.domain ? '+L3' : ''}) - ${results.length} résultats`
  )
}

// =============================================================================
// INVALIDATION INTELLIGENTE
// =============================================================================

/**
 * Invalide cache lorsqu'un nouveau document est indexé dans un domaine
 *
 * @param domain - Domaine juridique du nouveau document
 * @param category - Catégorie du document (optionnel)
 */
export async function invalidateCacheForDomain(
  domain: string,
  category?: string
): Promise<void> {
  if (!isRedisAvailable()) return

  try {
    const client = await getRedisClient()
    if (!client) return

    // Invalider L3 pour ce domaine
    const l3Keys = await client.keys(`search_l3:${domain}*`)
    for (const key of l3Keys) {
      await client.del(key)
    }

    console.log(
      `[EnhancedCache] Invalidation domaine="${domain}" (${l3Keys.length} entrées L3)`
    )

    // L1 et L2 seront invalidés progressivement via TTL
    // (pas d'invalidation immédiate car trop coûteux)
  } catch (error) {
    console.warn('[EnhancedCache] Erreur invalidation:', error)
  }
}

/**
 * Statistiques cache multi-niveaux
 */
export async function getEnhancedCacheStats(): Promise<{
  available: boolean
  l1Entries?: number
  l2Entries?: number
  l3Entries?: number
  totalHitRate?: number
}> {
  if (!isRedisAvailable()) {
    return { available: false }
  }

  try {
    const client = await getRedisClient()
    if (!client) return { available: false }

    const [l1Keys, l2Keys, l3Keys] = await Promise.all([
      client.keys('search_l1:*'),
      client.keys('search:*'), // L2 via search-cache.ts
      client.keys('search_l3:*'),
    ])

    return {
      available: true,
      l1Entries: l1Keys.length,
      l2Entries: l2Keys.length,
      l3Entries: l3Keys.length,
      totalHitRate: undefined, // Calculé dynamiquement en runtime
    }
  } catch {
    return { available: false }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  getEnhancedCachedResults as default,
  setEnhancedCachedResults,
  invalidateCacheForDomain,
  getEnhancedCacheStats,
}
