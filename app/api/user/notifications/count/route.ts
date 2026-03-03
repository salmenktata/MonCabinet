/**
 * GET /api/user/notifications/count
 * Retourne le nombre d'échéances urgentes (< 48h) pour la cloche navbar
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'
// Cache 5 minutes côté CDN pour éviter le polling trop fréquent
export const revalidate = 0

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ urgent: 0 }, { status: 200 })
    }

    const result = await query(
      `SELECT COUNT(*) as count
       FROM echeances
       WHERE user_id = $1
         AND statut != 'terminee'
         AND date_echeance BETWEEN NOW() AND NOW() + INTERVAL '48 hours'`,
      [session.user.id]
    )

    const urgent = parseInt(result.rows[0]?.count || '0', 10)

    return NextResponse.json({ urgent }, {
      headers: {
        'Cache-Control': 'private, max-age=300', // 5 min client cache
      },
    })
  } catch {
    return NextResponse.json({ urgent: 0 })
  }
}
