/**
 * Health Check Endpoint
 *
 * Vérifie l'état de santé de l'application et ses dépendances.
 * Utilisé par:
 * - Docker healthcheck
 * - Nginx monitoring
 * - UptimeRobot
 * - Load balancers
 */

import { NextResponse } from 'next/server'
import { healthCheck as dbHealthCheck, db } from '@/lib/db/postgres'
import { healthCheck as storageHealthCheck } from '@/lib/storage/minio'
import { isSemanticSearchEnabled } from '@/lib/ai/config'
import { getRedisClient } from '@/lib/cache/redis'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startTime = Date.now()
  const containerAge = process.uptime()
  const GRACE_PERIOD_SECONDS = 45 // Aligner avec docker start_period (40s) + marge
  const MAX_RETRIES = 2
  const RETRY_DELAY_MS = 1500

  // Helper: Retry avec timeout
  const checkWithRetry = async (
    checkFn: () => Promise<boolean>,
    serviceName: string
  ): Promise<boolean> => {
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const result = await Promise.race([
          checkFn(),
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 6000)
          ),
        ])

        if (result) {
          console.log(`✓ ${serviceName} healthy (attempt ${i + 1})`)
          return true
        }
      } catch (error) {
        console.warn(
          `⚠️ ${serviceName} check failed (attempt ${i + 1}/${MAX_RETRIES})`,
          error
        )
        if (i < MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        }
      }
    }
    return false
  }

  try {
    const dbHealthy = await checkWithRetry(dbHealthCheck, 'PostgreSQL')
    const storageHealthy = await checkWithRetry(storageHealthCheck, 'MinIO')
    const redisHealthy = await checkWithRetry(async () => {
      const client = await getRedisClient()
      if (!client) return false
      const pong = await client.ping()
      return pong === 'PONG'
    }, 'Redis')
    const duration = Date.now() - startTime

    // Grace period: Retourner 200 même si services pas encore ready
    if (containerAge < GRACE_PERIOD_SECONDS) {
      if (!dbHealthy || !storageHealthy || !redisHealthy) {
        console.log(
          `⏳ Container initializing (${Math.floor(containerAge)}s / ${GRACE_PERIOD_SECONDS}s grace period)`
        )
        return NextResponse.json(
          {
            status: 'starting',
            uptime: Math.floor(containerAge),
            gracePeriod: GRACE_PERIOD_SECONDS,
            timestamp: new Date().toISOString(),
            responseTime: `${duration}ms`,
            services: {
              database: dbHealthy ? 'healthy' : 'initializing',
              storage: storageHealthy ? 'healthy' : 'initializing',
              redis: redisHealthy ? 'healthy' : 'initializing',
              api: 'healthy',
            },
            message: 'Container initializing, services starting...',
            version: process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || '1.0.0',
          },
          { status: 200 } // 200 pour éviter rollback prématuré
        )
      }
    }

    // Après grace period : normal behavior
    if (dbHealthy && storageHealthy && redisHealthy) {
      // Récupérer statistiques RAG
      const ragEnabled = process.env.RAG_ENABLED === 'true'
      const semanticSearchEnabled = isSemanticSearchEnabled()
      const ollamaEnabled = process.env.OLLAMA_ENABLED === 'true'
      const openaiConfigured = !!process.env.OPENAI_API_KEY

      // Compter documents KB indexés (query rapide)
      let kbDocsIndexed = 0
      let kbChunksAvailable = 0
      try {
        const kbStats = await db.query(`
          SELECT
            (SELECT COUNT(*) FROM knowledge_base WHERE is_indexed = true) as docs_indexed,
            (SELECT COUNT(*) FROM knowledge_base_chunks WHERE embedding_openai IS NOT NULL OR embedding_gemini IS NOT NULL) as chunks_available
        `)
        kbDocsIndexed = kbStats.rows[0]?.docs_indexed || 0
        kbChunksAvailable = kbStats.rows[0]?.chunks_available || 0
      } catch (error) {
        console.warn('⚠️ KB stats check failed:', error)
      }

      return NextResponse.json(
        {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: Math.floor(containerAge),
          responseTime: `${duration}ms`,
          services: {
            database: 'healthy',
            storage: 'healthy',
            redis: 'healthy',
            api: 'healthy',
          },
          // NOUVELLE SECTION RAG
          rag: {
            enabled: ragEnabled,
            semanticSearchEnabled: semanticSearchEnabled,
            ollamaEnabled: ollamaEnabled,
            openaiConfigured: openaiConfigured,
            kbDocsIndexed: kbDocsIndexed,
            kbChunksAvailable: kbChunksAvailable,
            // Alerte si RAG enabled mais semantic search disabled
            status: ragEnabled && !semanticSearchEnabled ? 'misconfigured' : 'ok'
          },
          version: process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || '1.0.0',
        },
        { status: 200 }
      )
    }

    // Unhealthy après grace period
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(containerAge),
        responseTime: `${duration}ms`,
        services: {
          database: dbHealthy ? 'healthy' : 'unhealthy',
          storage: storageHealthy ? 'healthy' : 'unhealthy',
          redis: redisHealthy ? 'healthy' : 'unhealthy',
          api: 'healthy',
        },
        version: process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || '1.0.0',
      },
      { status: 503 }
    )
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('❌ Health check error:', error)

    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        responseTime: `${duration}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
        version: process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || '1.0.0',
      },
      { status: 503 }
    )
  }
}

/**
 * HEAD request pour vérifications légères
 * (utilisé par certains load balancers)
 */
export async function HEAD() {
  try {
    const dbHealthy = await dbHealthCheck()

    if (dbHealthy) {
      return new Response(null, { status: 200 })
    }

    return new Response(null, { status: 503 })
  } catch {
    return new Response(null, { status: 503 })
  }
}
