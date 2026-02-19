/**
 * API: Server-Sent Events pour notifications temps réel
 * GET /api/admin/cron-executions/stream
 * Auth: Session admin (Next-Auth)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { redis } from '@/lib/cache/redis'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

// Type pour les événements SSE
interface CronExecutionEvent {
  type: 'started' | 'completed' | 'failed'
  executionId: string
  cronName: string
  status: string
  durationMs?: number
  errorMessage?: string | null
  timestamp: string
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = withAdminApiAuth(async (req, _ctx, _session) => {
  // Créer stream SSE
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false

      // Fonction pour envoyer un événement SSE (avec vérification)
      const sendEvent = (event: CronExecutionEvent) => {
        if (isClosed) return
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`
          controller.enqueue(encoder.encode(data))
        } catch (error) {
          console.error('[SSE] Error sending event:', error)
          isClosed = true
        }
      }

      // Heartbeat pour garder la connexion vivante
      const heartbeatInterval = setInterval(() => {
        if (isClosed) {
          clearInterval(heartbeatInterval)
          return
        }
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch (error) {
          console.error('[SSE] Heartbeat failed, closing:', error)
          isClosed = true
          clearInterval(heartbeatInterval)
        }
      }, 30000) // Toutes les 30s

      // Subscribe à Redis PubSub pour les événements de cron
      const subscriber = redis.duplicate()
      await subscriber.connect()

      await subscriber.subscribe('cron:events', (message) => {
        try {
          const event = JSON.parse(message) as CronExecutionEvent
          sendEvent(event)
        } catch (error) {
          console.error('[SSE] Error parsing event:', error)
        }
      })

      // Cleanup à la fermeture de la connexion
      req.signal.addEventListener('abort', async () => {
        isClosed = true
        clearInterval(heartbeatInterval)
        try {
          await subscriber.unsubscribe('cron:events')
          await subscriber.quit()
        } catch (error) {
          console.error('[SSE] Error during cleanup:', error)
        }
        try {
          controller.close()
        } catch (error) {
          // Controller déjà fermé, ignorer
        }
      })

      // Envoyer événement initial de connexion
      sendEvent({
        type: 'started',
        executionId: 'connection',
        cronName: 'system',
        status: 'connected',
        timestamp: new Date().toISOString(),
      })
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
})
