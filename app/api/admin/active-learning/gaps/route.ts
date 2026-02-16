/**
 * API Active Learning - Gaps KB
 *
 * GET /api/admin/active-learning/gaps
 * Récupère les gaps identifiés dans la KB
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getActiveGaps, getActiveLearningStats } from '@/lib/ai/active-learning-service'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50')
    const status = (searchParams.get('status') as 'active' | 'resolved' | 'ignored') || 'active'
    const priority = parseInt(searchParams.get('priority') || '4') as 1 | 2 | 3 | 4

    const [gaps, stats] = await Promise.all([
      getActiveGaps({ limit, status, minPriority: priority }),
      getActiveLearningStats(),
    ])

    return NextResponse.json({
      success: true,
      gaps,
      stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('❌ Erreur API active-learning/gaps:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
