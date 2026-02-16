/**
 * API A/B Testing - Stats test
 *
 * GET /api/admin/ab-testing/stats?testId=xxx
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getTestStats } from '@/lib/ai/ab-testing-service'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const testId = request.nextUrl.searchParams.get('testId')
    if (!testId) {
      return NextResponse.json({ error: 'Missing testId' }, { status: 400 })
    }

    const stats = await getTestStats(testId)

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('❌ Erreur API ab-testing/stats:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
