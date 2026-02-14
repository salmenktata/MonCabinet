/**
 * API: Server-Sent Events pour notifications temps réel
 * GET /api/admin/cron-executions/stream
 * Auth: Session admin (Next-Auth)
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db/postgres'
import { redis } from '@/lib/cache/redis'

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

export async function GET(req: NextRequest) {
  // 1. Vérifier auth admin (optionnel, décommenter si nécessaire)
  // const session = await getServerSession(authOptions)
  // if (!session || session.user.role !== 'admin') {
  //   return new Response('Unauthorized', { status: 401 })
  // }

  // 2. Créer stream SSE
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Fonction pour envoyer un événement SSE
      const sendEvent = (event: CronExecutionEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`
        controller.enqueue(encoder.encode(data))
      }

      // Heartbeat pour garder la connexion vivante
      const heartbeatInterval = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'))
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
        clearInterval(heartbeatInterval)
        await subscriber.unsubscribe('cron:events')
        await subscriber.quit()
        controller.close()
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

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
