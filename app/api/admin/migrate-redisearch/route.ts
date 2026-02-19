import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { createClient } from 'redis'
import { db } from '@/lib/db/postgres'

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379'
const INDEX_NAME = 'idx:kb_chunks'
const KEY_PREFIX = 'kb:chunk:'
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100', 10)

interface KBChunk {
  id: string
  knowledge_base_id: string
  content: string
  category: string
  language: string
  embedding: number[] | null
}

export const POST = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    // Paramètres
    const { forceRecreate = false, dryRun = false } = await request.json().catch(() => ({}))

    const results = {
      indexCreated: false,
      chunksIndexed: 0,
      errors: 0,
      duration: 0
    }

    const startTime = Date.now()

    // Créer client Redis
    const redis = createClient({ url: REDIS_URL })
    await redis.connect()

    try {
      // Phase 1: Créer index RediSearch
      try {
        await redis.sendCommand(['FT.INFO', INDEX_NAME])

        if (forceRecreate) {
          await redis.sendCommand(['FT.DROPINDEX', INDEX_NAME, 'DD'])
        } else {
          return NextResponse.json({
            success: false,
            message: 'Index existe déjà. Utilisez forceRecreate: true pour recréer.',
            results
          })
        }
      } catch (err: any) {
        if (!err.message?.includes('Unknown Index name')) {
          throw err
        }
      }

      if (!dryRun) {
        // Créer index avec schéma
        await redis.sendCommand([
          'FT.CREATE',
          INDEX_NAME,
          'ON',
          'HASH',
          'PREFIX',
          '1',
          KEY_PREFIX,
          'SCHEMA',
          'kb_id',
          'TAG',
          'SORTABLE',
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

        results.indexCreated = true
      }

      // Phase 2: Indexer chunks
      const countResult = await db.query('SELECT COUNT(*) as count FROM knowledge_base_chunks')
      const totalChunks = parseInt(countResult.rows[0].count, 10)

      if (!dryRun) {
        for (let offset = 0; offset < totalChunks; offset += BATCH_SIZE) {
          const result = await db.query<KBChunk>(
            `SELECT
              id,
              knowledge_base_id,
              content,
              category,
              language,
              embedding
            FROM knowledge_base_chunks kbc
            INNER JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
            ORDER BY kbc.created_at ASC
            LIMIT $1 OFFSET $2`,
            [BATCH_SIZE, offset]
          )

          if (result.rows.length === 0) break

          const pipeline = redis.multi()

          for (const chunk of result.rows) {
            try {
              const redisKey = `${KEY_PREFIX}${chunk.id}`

              let embeddingBuffer: Buffer | null = null
              if (chunk.embedding) {
                const embeddingArray =
                  typeof chunk.embedding === 'string'
                    ? JSON.parse(chunk.embedding)
                    : chunk.embedding
                embeddingBuffer = Buffer.from(new Float32Array(embeddingArray).buffer)
              }

              const hashData: Record<string, string | Buffer> = {
                kb_id: chunk.knowledge_base_id,
                content: chunk.content,
                category: chunk.category,
                language: chunk.language || 'ar',
              }

              if (embeddingBuffer) {
                hashData.embedding = embeddingBuffer
              }

              pipeline.hSet(redisKey, hashData)

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

              results.chunksIndexed++
            } catch (error) {
              results.errors++
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

          await pipeline.exec()
        }
      }

      results.duration = Date.now() - startTime

      return NextResponse.json({
        success: true,
        message: `Migration terminée en ${(results.duration / 1000).toFixed(1)}s`,
        results,
        totalChunks
      })
    } finally {
      await redis.disconnect()
    }
  } catch (error) {
    console.error('Erreur migration RediSearch:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
