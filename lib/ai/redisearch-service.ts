/**
 * Service de recherche RediSearch - Phase 2 RAG Optimizations
 *
 * Recherche hybride ultra-rapide (vectorielle + BM25) avec RediSearch.
 * Latence cible : 200-500ms P50 (vs 1.5-2s PostgreSQL Phase 1)
 *
 * Architecture :
 * - PostgreSQL = Source de vérité (TOUJOURS)
 * - RediSearch = Cache recherche (RAM, rebuildable)
 * - Dual-write via triggers PostgreSQL
 * - Fallback automatique vers PostgreSQL si Redis down
 *
 * @module lib/ai/redisearch-service
 */

import { getRedisClient } from '@/lib/cache/redis'
import { generateEmbedding } from './embeddings-service'
import type { KnowledgeBaseSearchResult } from './knowledge-base-service'

// =============================================================================
// CONFIGURATION
// =============================================================================

const REDISEARCH_ENABLED = process.env.USE_REDISEARCH === 'true'
const REDISEARCH_INDEX_NAME = 'idx:kb_chunks'
const REDISEARCH_PREFIX = 'kb:chunk:'

// =============================================================================
// SEARCH
// =============================================================================

/**
 * Recherche hybride dans RediSearch (vectorielle + BM25)
 *
 * @param query Requête utilisateur
 * @param options Options recherche (category, limit, threshold)
 * @returns Résultats recherche
 */
export async function searchKnowledgeBaseRediSearch(
  query: string,
  options: {
    category?: string
    limit?: number
    threshold?: number
  } = {}
): Promise<KnowledgeBaseSearchResult[]> {
  if (!REDISEARCH_ENABLED) {
    throw new Error('RediSearch not enabled. Set USE_REDISEARCH=true')
  }

  const redis = await getRedisClient()
  if (!redis) {
    throw new Error('Redis client not available')
  }

  const limit = options.limit || 15
  const threshold = options.threshold || 0.65

  try {
    // 1. Générer embedding query (utilise config par défaut)
    const { embedding } = await generateEmbedding(query)

    // Convertir embedding en buffer Float32
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer)

    // 2. Construire query RediSearch hybride
    // Format: (@field:value) => [KNN k @vector $vec AS similarity]
    let queryStr = `(@content:${escapeRediSearchQuery(query)})`

    // Filtre catégorie si spécifié
    if (options.category) {
      queryStr += ` @category:{${options.category}}`
    }

    // KNN vectoriel
    queryStr += ` => [KNN ${limit * 2} @embedding $vec AS similarity]`

    // 3. Exécuter FT.SEARCH
    const results = (await redis.sendCommand([
      'FT.SEARCH',
      REDISEARCH_INDEX_NAME,
      queryStr,
      'PARAMS',
      '2',
      'vec',
      embeddingBuffer as any,
      'SORTBY',
      'similarity',
      'LIMIT',
      '0',
      limit.toString(),
      'RETURN',
      '7',
      'kb_id',
      'title',
      'content',
      'similarity',
      'category',
      'language',
      'metadata',
    ])) as any[]

    // 4. Parser résultats
    return parseRediSearchResults(results, threshold)
  } catch (error) {
    console.error('[RediSearch] Search error:', error)
    throw error
  }
}

/**
 * Parse les résultats bruts de FT.SEARCH
 *
 * Format RediSearch :
 * [count, doc1_key, [field1, value1, field2, value2, ...], doc2_key, [...]]
 */
function parseRediSearchResults(
  raw: any[],
  threshold: number
): KnowledgeBaseSearchResult[] {
  if (!raw || raw.length < 2) {
    return []
  }

  const results: KnowledgeBaseSearchResult[] = []

  // Itérer par paires (clé, fields)
  for (let i = 1; i < raw.length; i += 2) {
    const key = raw[i] as string
    const fields = raw[i + 1] as string[]

    // Convertir array [field, value, field, value] en objet
    const doc: Record<string, string> = {}
    for (let j = 0; j < fields.length; j += 2) {
      doc[fields[j]] = fields[j + 1]
    }

    // Calculer similarité (distance cosinus → score)
    const distance = parseFloat(doc.similarity || '1')
    const similarity = 1 - distance // Convertir distance en score

    // Filtrer par threshold
    if (similarity < threshold) {
      continue
    }

    // Extraire chunk_id depuis clé "kb:chunk:uuid"
    const chunkId = key.replace(REDISEARCH_PREFIX, '')

    results.push({
      id: chunkId,
      knowledgeBaseId: doc.kb_id,
      title: doc.title || '',
      contentChunk: doc.content,
      chunkIndex: 0, // Non disponible dans Redis
      similarity,
      category: doc.category as any,
      language: doc.language as 'ar' | 'fr' | 'bi',
      metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
    })
  }

  return results
}

/**
 * Escape caractères spéciaux pour requête RediSearch
 */
function escapeRediSearchQuery(query: string): string {
  // Caractères spéciaux RediSearch : , . < > { } [ ] " ' : ; ! @ # $ % ^ & * ( ) - + = ~ |
  return query
    .replace(/([,.<>{}[\]"':;!@#$%^&*()\-+=~|])/g, '\\$1')
    .replace(/\s+/g, ' ')
    .trim()
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Vérifie que RediSearch est disponible et l'index existe
 */
export async function redisearchHealthCheck(): Promise<{
  enabled: boolean
  available: boolean
  indexExists: boolean
  indexInfo?: any
}> {
  if (!REDISEARCH_ENABLED) {
    return {
      enabled: false,
      available: false,
      indexExists: false,
    }
  }

  try {
    const redis = await getRedisClient()
    if (!redis) {
      return {
        enabled: true,
        available: false,
        indexExists: false,
      }
    }

    // Vérifier si l'index existe
    const indexInfo = await redis.sendCommand(['FT.INFO', REDISEARCH_INDEX_NAME])

    return {
      enabled: true,
      available: true,
      indexExists: true,
      indexInfo,
    }
  } catch (error: any) {
    // Erreur "Unknown Index name" = index n'existe pas
    if (error.message?.includes('Unknown Index')) {
      return {
        enabled: true,
        available: true,
        indexExists: false,
      }
    }

    return {
      enabled: true,
      available: false,
      indexExists: false,
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const RediSearchConfig = {
  enabled: REDISEARCH_ENABLED,
  indexName: REDISEARCH_INDEX_NAME,
  prefix: REDISEARCH_PREFIX,
}
