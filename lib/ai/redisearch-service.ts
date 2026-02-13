/**
 * RediSearch Service - Recherche vectorielle + texte ultra-rapide
 *
 * Ce service fournit:
 * 1. Recherche hybride (vectorielle + BM25) via RediSearch
 * 2. Fallback automatique vers PostgreSQL si Redis indisponible
 * 3. Feature flag USE_REDISEARCH pour activer/désactiver
 *
 * Performance attendue:
 * - Latence P50: 200-500ms (vs 1.5-2s PostgreSQL)
 * - Latence P95: 800ms-1.5s (vs 2-3s PostgreSQL)
 *
 * Architecture:
 * - PostgreSQL = Source de vérité (TOUJOURS)
 * - RediSearch = Cache recherche (lecture seule, rebuild-able)
 */

import { createClient, RedisClientType } from 'redis'
import { generateEmbedding } from './embeddings-service'
import { searchKnowledgeBaseHybrid } from './knowledge-base-service'
import type { KnowledgeBaseSearchResult } from './knowledge-base-service'

// =============================================================================
// CONFIGURATION
// =============================================================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const USE_REDISEARCH = process.env.USE_REDISEARCH === 'true'
const INDEX_NAME = 'idx:kb_chunks'

// Timeouts
const REDISEARCH_TIMEOUT_MS = parseInt(process.env.REDISEARCH_TIMEOUT_MS || '5000', 10)

// Poids hybrid search
const VECTOR_WEIGHT = 0.7 // 70% similarité vectorielle
const BM25_WEIGHT = 0.3 // 30% BM25 texte

// =============================================================================
// TYPES
// =============================================================================

export interface RediSearchOptions {
  query: string
  category?: string
  language?: string
  limit?: number
  threshold?: number
  useOpenAI?: boolean // Utiliser embedding OpenAI (1536-dim) au lieu de Ollama (1024-dim)
}

export interface RediSearchResult {
  chunkId: string
  knowledgeBaseId: string
  title: string
  content: string
  category: string
  language: string
  similarity: number // Score combiné (vectoriel + BM25)
  vectorScore: number // Score vectoriel pur
  bm25Score: number // Score BM25 pur
}

// =============================================================================
// REDIS CLIENT (singleton avec reconnexion auto)
// =============================================================================

let redisClient: RedisClientType | null = null
let redisConnectionAttempts = 0
const MAX_CONNECTION_ATTEMPTS = 3

async function getRedisClient(): Promise<RedisClientType | null> {
  if (!USE_REDISEARCH) {
    return null
  }

  if (redisClient?.isOpen) {
    return redisClient
  }

  if (redisConnectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
    console.warn('[RediSearch] Max tentatives connexion atteint, fallback PostgreSQL')
    return null
  }

  try {
    redisConnectionAttempts++

    const client = createClient({
      url: REDIS_URL,
      socket: {
        connectTimeout: 3000,
        reconnectStrategy: (retries) => {
          if (retries > 3) return false // Abandon après 3 retries
          return Math.min(retries * 100, 1000)
        },
      },
    })

    client.on('error', (err) => {
      console.error('[RediSearch] Erreur client:', err.message)
    })

    client.on('reconnecting', () => {
      console.log('[RediSearch] Reconnexion en cours...')
    })

    await client.connect()

    console.log('[RediSearch] ✅ Connecté à Redis')
    redisClient = client
    redisConnectionAttempts = 0 // Reset counter on success

    return client
  } catch (error) {
    console.error(`[RediSearch] ❌ Connexion échouée (tentative ${redisConnectionAttempts}):`, error)
    return null
  }
}

// =============================================================================
// ESCAPE QUERY (RediSearch syntax)
// =============================================================================

function escapeRedisearchQuery(query: string): string {
  // Échapper caractères spéciaux RediSearch
  return query.replace(/([,.<>{}[\]"':;!@#$%^&*()\-+=~])/g, '\\$1')
}

// =============================================================================
// RECHERCHE REDISEARCH HYBRIDE (Vectorielle + BM25)
// =============================================================================

export async function searchKnowledgeBaseRediSearch(
  options: RediSearchOptions
): Promise<KnowledgeBaseSearchResult[]> {
  const {
    query,
    category,
    language,
    limit = 15,
    threshold = 0.65,
    useOpenAI = false,
  } = options

  // Feature flag check
  if (!USE_REDISEARCH) {
    console.log('[RediSearch] Feature flag désactivé, fallback PostgreSQL')
    return searchKnowledgeBaseHybrid(query, { category, language, limit, threshold })
  }

  const startTime = Date.now()

  try {
    // 1. Obtenir client Redis
    const redis = await getRedisClient()
    if (!redis) {
      console.warn('[RediSearch] Client indisponible, fallback PostgreSQL')
      return searchKnowledgeBaseHybrid(query, { category, language, limit, threshold })
    }

    // 2. Générer embedding query
    const embeddingStartTime = Date.now()
    const { embedding } = await generateEmbedding(query, {
      operationName: 'assistant-ia',
    })
    const embeddingDuration = Date.now() - embeddingStartTime

    // Convertir embedding en buffer FLOAT32
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer)

    // 3. Construire query RediSearch hybride
    let queryStr = `(@content:${escapeRedisearchQuery(query)})`

    // Filtres optionnels
    if (category) {
      queryStr += ` @category:{${category}}`
    }
    if (language) {
      queryStr += ` @language:{${language}}`
    }

    // KNN vectoriel
    queryStr += ` => [KNN ${limit * 2} @embedding $vec AS similarity]`

    console.log('[RediSearch] Query:', queryStr.substring(0, 100) + '...')

    // 4. Exécuter recherche RediSearch avec timeout
    const searchStartTime = Date.now()
    const searchPromise = redis.sendCommand([
      'FT.SEARCH',
      INDEX_NAME,
      queryStr,
      'PARAMS',
      '2',
      'vec',
      embeddingBuffer,
      'SORTBY',
      'similarity',
      'LIMIT',
      '0',
      String(limit * 2), // Fetch 2× pour re-ranking
      'RETURN',
      '8',
      'kb_id',
      'title',
      'content',
      'category',
      'language',
      'similarity',
      '$similarity',
      '$content_score', // Score BM25
    ])

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('RediSearch timeout')), REDISEARCH_TIMEOUT_MS)
    )

    const rawResults = (await Promise.race([searchPromise, timeoutPromise])) as any[]
    const searchDuration = Date.now() - searchStartTime

    // 5. Parser résultats RediSearch
    const resultCount = rawResults[0] as number
    const results: RediSearchResult[] = []

    if (resultCount === 0) {
      console.log('[RediSearch] Aucun résultat trouvé')
      return []
    }

    // Format RediSearch: [count, key1, [field1, value1, field2, value2, ...], key2, [...]]
    for (let i = 1; i < rawResults.length; i += 2) {
      const redisKey = rawResults[i] as string
      const fields = rawResults[i + 1] as string[]

      const fieldsMap: Record<string, string> = {}
      for (let j = 0; j < fields.length; j += 2) {
        fieldsMap[fields[j]] = fields[j + 1]
      }

      // Extraire chunk_id depuis redis key (format: kb:chunk:{id})
      const chunkId = redisKey.split(':')[2]

      // Scores
      const vectorScore = parseFloat(fieldsMap.similarity || fieldsMap.$similarity || '0')
      const bm25Score = parseFloat(fieldsMap.$content_score || '0')

      // Score combiné (70% vectoriel + 30% BM25)
      const combinedScore = vectorScore * VECTOR_WEIGHT + bm25Score * BM25_WEIGHT

      if (combinedScore >= threshold) {
        results.push({
          chunkId,
          knowledgeBaseId: fieldsMap.kb_id,
          title: fieldsMap.title || '',
          content: fieldsMap.content,
          category: fieldsMap.category,
          language: fieldsMap.language,
          similarity: combinedScore,
          vectorScore,
          bm25Score,
        })
      }
    }

    // 6. Trier par score combiné DESC
    results.sort((a, b) => b.similarity - a.similarity)

    // 7. Limiter résultats
    const finalResults = results.slice(0, limit)

    const totalDuration = Date.now() - startTime
    console.log(
      `[RediSearch] ✅ Recherche terminée: ${finalResults.length} résultats en ${totalDuration}ms ` +
        `(embedding: ${embeddingDuration}ms, search: ${searchDuration}ms)`
    )

    // Convertir au format KnowledgeBaseSearchResult
    return finalResults.map((r) => ({
      id: r.chunkId,
      knowledgeBaseId: r.knowledgeBaseId,
      title: r.title,
      content: r.content,
      category: r.category,
      language: r.language,
      similarity: r.similarity,
      metadata: {
        vectorScore: r.vectorScore,
        bm25Score: r.bm25Score,
        source: 'redisearch',
      },
    }))
  } catch (error: any) {
    const duration = Date.now() - startTime

    if (error.message === 'RediSearch timeout') {
      console.error(`[RediSearch] ⏱️  Timeout après ${duration}ms, fallback PostgreSQL`)
    } else {
      console.error(`[RediSearch] ❌ Erreur: ${error.message}, fallback PostgreSQL`)
    }

    // Fallback PostgreSQL
    return searchKnowledgeBaseHybrid(query, { category, language, limit, threshold })
  }
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

export async function redisearchHealthCheck(): Promise<{
  available: boolean
  latency?: number
  indexSize?: string
  docsCount?: number
  error?: string
}> {
  try {
    const redis = await getRedisClient()
    if (!redis) {
      return { available: false, error: 'Client indisponible' }
    }

    const startTime = Date.now()

    // Test PING
    await redis.ping()
    const latency = Date.now() - startTime

    // Stats index
    const info = await redis.sendCommand(['FT.INFO', INDEX_NAME])
    const infoObj: Record<string, any> = {}

    for (let i = 0; i < info.length; i += 2) {
      infoObj[info[i] as string] = info[i + 1]
    }

    return {
      available: true,
      latency,
      indexSize: `${((infoObj.inverted_sz_mb || 0) as number).toFixed(2)} MB`,
      docsCount: infoObj.num_docs || 0,
    }
  } catch (error: any) {
    return {
      available: false,
      error: error.message,
    }
  }
}

// =============================================================================
// CLEANUP (graceful shutdown)
// =============================================================================

export async function closeRedisClient() {
  if (redisClient?.isOpen) {
    await redisClient.disconnect()
    console.log('[RediSearch] Connexion fermée')
  }
}

// Graceful shutdown
process.on('SIGTERM', closeRedisClient)
process.on('SIGINT', closeRedisClient)
