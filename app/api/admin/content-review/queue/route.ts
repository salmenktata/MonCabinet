/**
 * API Content Review - Queue
 *
 * GET /api/admin/content-review/queue
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getReviewQueue } from '@/lib/content/review-service'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const queue = await getReviewQueue(50)

    return NextResponse.json({
      success: true,
      queue,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('❌ Erreur API content-review/queue:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
