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
import { healthCheck as dbHealthCheck } from '@/lib/db/postgres'
import { healthCheck as storageHealthCheck } from '@/lib/storage/minio'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startTime = Date.now()

  try {
    // Vérifier PostgreSQL
    const dbHealthy = await dbHealthCheck()

    // Vérifier MinIO
    const storageHealthy = await storageHealthCheck()

    const duration = Date.now() - startTime

    // Si tous les services sont OK
    if (dbHealthy && storageHealthy) {
      return NextResponse.json(
        {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          responseTime: `${duration}ms`,
          services: {
            database: 'healthy',
            storage: 'healthy',
            api: 'healthy',
          },
          version: process.env.npm_package_version || '1.0.0',
          build: process.env.DEPLOY_TIER || 'unknown',
        },
        { status: 200 }
      )
    }

    // Si un service est KO
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime: `${duration}ms`,
        services: {
          database: dbHealthy ? 'healthy' : 'unhealthy',
          storage: storageHealthy ? 'healthy' : 'unhealthy',
          api: 'healthy',
        },
        version: process.env.npm_package_version || '1.0.0',
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
        uptime: process.uptime(),
        responseTime: `${duration}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
        version: process.env.npm_package_version || '1.0.0',
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
