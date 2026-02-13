#!/usr/bin/env tsx
/**
 * Migration PostgreSQL → RediSearch
 *
 * Ce script:
 * 1. Crée index RediSearch (FT.CREATE)
 * 2. Indexe tous chunks existants en batch
 * 3. Track synchronisation dans redisearch_sync_status
 *
 * Usage:
 *   npx tsx scripts/migrate-to-redisearch.ts
 *   npx tsx scripts/migrate-to-redisearch.ts --batch-size=50
 *   npx tsx scripts/migrate-to-redisearch.ts --force-recreate
 *
 * Durée estimée: 15-30min pour 14k chunks (dépend CPU Redis)
 */

import { createClient, RedisClientType } from 'redis'
import { db } from '@/lib/db/postgres'

// =============================================================================
// CONFIGURATION
// =============================================================================

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100', 10)
const FORCE_RECREATE = process.argv.includes('--force-recreate')
const DRY_RUN = process.argv.includes('--dry-run')

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const INDEX_NAME = 'idx:kb_chunks'
const KEY_PREFIX = 'kb:chunk:'

// =============================================================================
// TYPES
// =============================================================================

interface KBChunk {
  id: string
  knowledge_base_id: string
  title: string | null
  content_chunk: string
  category: string
  language: string
  embedding: number[] | null
  embedding_openai: number[] | null
}

// =============================================================================
// REDIS CLIENT
// =============================================================================

let redisClient: RedisClientType | null = null

async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createClient({ url: REDIS_URL })

    redisClient.on('error', (err) => {
      console.error('❌ Redis Client Error:', err)
    })

    await redisClient.connect()
    console.log('✅ Connecté à Redis:', REDIS_URL)
  }

  return redisClient
}

// =============================================================================
// HELPERS
// =============================================================================

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function logSuccess(message: string) {
  console.log(`[${new Date().toISOString()}] ✅ ${message}`)
}

function logError(message: string) {
  console.error(`[${new Date().toISOString()}] ❌ ${message}`)
}

function logWarning(message: string) {
  console.warn(`[${new Date().toISOString()}] ⚠️  ${message}`)
}

// =============================================================================
// REDISEARCH INDEX CREATION
// =============================================================================

async function createRedisearchIndex(redis: RedisClientType): Promise<boolean> {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log('PHASE 1: Création Index RediSearch')
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  try {
    // Vérifier si index existe
    try {
      const info = await redis.sendCommand(['FT.INFO', INDEX_NAME])
      log(`Index ${INDEX_NAME} existe déjà`)

      if (FORCE_RECREATE) {
        logWarning('Flag --force-recreate détecté, suppression index existant')
        await redis.sendCommand(['FT.DROPINDEX', INDEX_NAME, 'DD']) // DD = Drop Documents
        log('Index supprimé')
      } else {
        logWarning('Index existe. Utilisez --force-recreate pour recréer.')
        return false
      }
    } catch (err: any) {
      if (err.message?.includes('Unknown Index name')) {
        log('Index n\'existe pas, création...')
      } else {
        throw err
      }
    }

    // Créer index RediSearch
    log('Création index avec schéma:')
    log('  - kb_id: TAG (filtrage par document)')
    log('  - title: TEXT + PHONETIC dm:ar (typo-tolerance arabe)')
    log('  - content: TEXT + PHONETIC dm:ar (recherche plein texte)')
    log('  - category: TAG (filtrage par catégorie)')
    log('  - language: TAG (filtrage par langue)')
    log('  - embedding: VECTOR HNSW 1024-dim (recherche sémantique Ollama)')

    if (DRY_RUN) {
      log('[DRY-RUN] Index NON créé')
      return true
    }

    await redis.sendCommand([
      'FT.CREATE',
      INDEX_NAME,
      'ON',
      'HASH',
      'PREFIX',
      '1',
      KEY_PREFIX,
      'SCHEMA',
      // Champs metadata
      'kb_id',
      'TAG',
      'SORTABLE',
      'title',
      'TEXT',
      'WEIGHT',
      '2.0',
      'PHONETIC',
      'dm:ar', // Double Metaphone arabe
      'content',
      'TEXT',
      'WEIGHT',
      '1.0',
      'PHONETIC',
      'dm:ar',
      'category',
      'TAG',
      'language',
      'TAG',
      // Champ vectoriel (Ollama 1024-dim)
      'embedding',
      'VECTOR',
      'HNSW',
      '6',
      'TYPE',
      'FLOAT32',
      'DIM',
      '1024',
      'DISTANCE_METRIC',
      'COSINE',
    ])

    logSuccess('Index RediSearch créé avec succès')
    return true
  } catch (error) {
    logError(`Échec création index: ${error}`)
    throw error
  }
}

// =============================================================================
// INDEXATION CHUNKS
// =============================================================================

async function indexChunks(redis: RedisClientType): Promise<void> {
  log('')
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log('PHASE 2: Indexation Chunks')
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // Compter total chunks
  const countResult = await db.query('SELECT COUNT(*) as count FROM knowledge_base_chunks')
  const totalChunks = parseInt(countResult.rows[0].count, 10)

  log(`Total chunks à indexer: ${totalChunks}`)
  log(`Batch size: ${BATCH_SIZE}`)
  log(`Durée estimée: ${Math.ceil((totalChunks / BATCH_SIZE) * 5)}s (5s/batch)`)

  if (DRY_RUN) {
    log('[DRY-RUN] Indexation NON effectuée')
    return
  }

  let indexed = 0
  let errors = 0
  const startTime = Date.now()

  // Indexer en batches
  for (let offset = 0; offset < totalChunks; offset += BATCH_SIZE) {
    const batchStartTime = Date.now()

    // Récupérer batch de chunks
    const result = await db.query<KBChunk>(
      `SELECT
        id,
        knowledge_base_id,
        title,
        content_chunk,
        category,
        language,
        embedding,
        embedding_openai
      FROM knowledge_base_chunks
      ORDER BY created_at ASC
      LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    )

    if (result.rows.length === 0) break

    // Indexer batch dans Redis (pipeline pour performance)
    const pipeline = redis.multi()

    for (const chunk of result.rows) {
      try {
        const redisKey = `${KEY_PREFIX}${chunk.id}`

        // Préparer embedding (FLOAT32 buffer)
        let embeddingBuffer: Buffer | null = null
        if (chunk.embedding) {
          const embeddingArray =
            typeof chunk.embedding === 'string'
              ? JSON.parse(chunk.embedding)
              : chunk.embedding
          embeddingBuffer = Buffer.from(new Float32Array(embeddingArray).buffer)
        }

        // Créer hash Redis
        const hashData: Record<string, string | Buffer> = {
          kb_id: chunk.knowledge_base_id,
          title: chunk.title || '',
          content: chunk.content_chunk,
          category: chunk.category,
          language: chunk.language || 'ar',
        }

        if (embeddingBuffer) {
          hashData.embedding = embeddingBuffer
        }

        pipeline.hSet(redisKey, hashData)

        // Track dans PostgreSQL
        await db.query(
          `INSERT INTO redisearch_sync_status (
            knowledge_base_id,
            chunk_id,
            redis_key,
            sync_status
          ) VALUES ($1, $2, $3, 'synced')
          ON CONFLICT (chunk_id, redis_key)
          DO UPDATE SET
            sync_status = 'synced',
            last_synced_at = NOW(),
            sync_version = redisearch_sync_status.sync_version + 1`,
          [chunk.knowledge_base_id, chunk.id, redisKey]
        )

        indexed++
      } catch (error) {
        logError(`Erreur indexation chunk ${chunk.id}: ${error}`)
        errors++

        // Track erreur dans PostgreSQL
        await db.query(
          `INSERT INTO redisearch_sync_status (
            knowledge_base_id,
            chunk_id,
            redis_key,
            sync_status,
            error_message
          ) VALUES ($1, $2, $3, 'error', $4)
          ON CONFLICT (chunk_id, redis_key)
          DO UPDATE SET
            sync_status = 'error',
            error_message = $4,
            updated_at = NOW()`,
          [chunk.knowledge_base_id, chunk.id, `${KEY_PREFIX}${chunk.id}`, String(error)]
        )
      }
    }

    // Exécuter pipeline
    await pipeline.exec()

    const batchDuration = Date.now() - batchStartTime
    const progress = ((offset + result.rows.length) / totalChunks) * 100

    log(
      `Batch ${Math.ceil((offset + BATCH_SIZE) / BATCH_SIZE)}: ` +
        `${indexed}/${totalChunks} chunks (${progress.toFixed(1)}%) | ` +
        `${batchDuration}ms | ` +
        `Errors: ${errors}`
    )
  }

  const totalDuration = (Date.now() - startTime) / 1000
  log('')
  logSuccess(`Indexation terminée en ${totalDuration.toFixed(1)}s`)
  logSuccess(`Indexed: ${indexed} chunks`)
  if (errors > 0) {
    logWarning(`Errors: ${errors} chunks (voir redisearch_sync_status)`)
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

async function validateIndexation(redis: RedisClientType): Promise<void> {
  log('')
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log('PHASE 3: Validation Indexation')
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  try {
    // Stats RediSearch
    const info = await redis.sendCommand(['FT.INFO', INDEX_NAME])
    const infoObj: Record<string, any> = {}

    for (let i = 0; i < info.length; i += 2) {
      infoObj[info[i] as string] = info[i + 1]
    }

    log(`Index name: ${infoObj.index_name || INDEX_NAME}`)
    log(`Docs count: ${infoObj.num_docs || 0}`)
    log(`Index size: ${((infoObj.inverted_sz_mb || 0) as number).toFixed(2)} MB`)

    // Stats PostgreSQL
    const pgStats = await db.query(`
      SELECT
        sync_status,
        COUNT(*) as count
      FROM redisearch_sync_status
      GROUP BY sync_status
      ORDER BY count DESC
    `)

    log('\nSynchronisation PostgreSQL:')
    for (const row of pgStats.rows) {
      log(`  ${row.sync_status}: ${row.count}`)
    }

    // Test recherche simple
    log('\nTest recherche simple:')
    const testQuery = 'عقد' // "contrat" en arabe
    const searchResult = await redis.sendCommand([
      'FT.SEARCH',
      INDEX_NAME,
      testQuery,
      'LIMIT',
      '0',
      '3',
    ])

    const resultCount = searchResult[0]
    log(`Query: "${testQuery}" → ${resultCount} résultats`)

    if (resultCount > 0) {
      logSuccess('Recherche RediSearch fonctionnelle ✅')
    } else {
      logWarning('Aucun résultat trouvé (peut être normal si KB vide)')
    }

    logSuccess('Validation terminée')
  } catch (error) {
    logError(`Validation échouée: ${error}`)
    throw error
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🚀 MIGRATION POSTGRESQL → REDISEARCH')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log(`Configuration:`)
  console.log(`  REDIS_URL: ${REDIS_URL}`)
  console.log(`  BATCH_SIZE: ${BATCH_SIZE}`)
  console.log(`  FORCE_RECREATE: ${FORCE_RECREATE}`)
  console.log(`  DRY_RUN: ${DRY_RUN}`)
  console.log('')

  try {
    const redis = await getRedisClient()

    // Phase 1: Créer index
    const indexCreated = await createRedisearchIndex(redis)

    if (!indexCreated && !FORCE_RECREATE) {
      log('')
      logWarning('Index existe déjà. Utilisez --force-recreate pour recréer.')
      log('Passage Phase 2 pour réindexation incrémentale...')
    }

    // Phase 2: Indexer chunks
    await indexChunks(redis)

    // Phase 3: Validation
    await validateIndexation(redis)

    // Cleanup
    await redis.disconnect()

    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    logSuccess('MIGRATION TERMINÉE AVEC SUCCÈS')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    console.log('📊 Prochaines étapes:')
    console.log('  1. Activer feature flag: USE_REDISEARCH=true dans .env')
    console.log('  2. Redémarrer application')
    console.log('  3. Tester recherche: npx tsx scripts/test-redisearch-search.ts')
    console.log('  4. Benchmark: npx tsx scripts/benchmark-redisearch.ts')
    console.log('')

    process.exit(0)
  } catch (error) {
    logError(`Migration échouée: ${error}`)
    process.exit(1)
  }
}

// Exécuter
main()
