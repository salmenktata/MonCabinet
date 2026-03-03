/**
 * API Monitoring — Statut Serveur VPS
 *
 * GET /api/admin/server-status?section=current
 *   → Snapshot instantané : CPU, RAM, disque, swap, process info
 *
 * GET /api/admin/server-status?section=services
 *   → Santé des services : PostgreSQL, Redis, MinIO, Ollama, Next.js
 *
 * GET /api/admin/server-status?section=history&hours=1|6|24
 *   → Historique Redis des dernières N heures
 *
 * Auth: session super_admin OU CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import {
  collectSystemStats,
  getServicesHealth,
  storeSnapshotToRedis,
  getHistoryFromRedis,
} from '@/lib/monitoring/system-stats'

export const GET = withAdminApiAuth(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const section = searchParams.get('section') || 'current'
  const hours = (parseInt(searchParams.get('hours') || '24') || 24) as 1 | 6 | 24

  try {
    switch (section) {
      case 'current': {
        const snapshot = await collectSystemStats()
        // Stocker en historique Redis (fire-and-forget)
        storeSnapshotToRedis(snapshot).catch(() => {})
        return NextResponse.json({ ok: true, data: snapshot })
      }

      case 'services': {
        const services = await getServicesHealth()
        return NextResponse.json({ ok: true, data: services })
      }

      case 'history': {
        const validHours: (1 | 6 | 24)[] = [1, 6, 24]
        const h: 1 | 6 | 24 = validHours.includes(hours as 1 | 6 | 24) ? (hours as 1 | 6 | 24) : 24
        const history = await getHistoryFromRedis(h)
        return NextResponse.json({ ok: true, data: history, hours: h })
      }

      default:
        return NextResponse.json({ ok: false, error: 'section invalide' }, { status: 400 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}, { allowCronSecret: true })
