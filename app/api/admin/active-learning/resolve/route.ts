/**
 * API Active Learning - Résoudre Gap
 *
 * POST /api/admin/active-learning/resolve
 * Marque un gap comme résolu
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveGap } from '@/lib/ai/active-learning-service'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { gapId, resolutionNotes } = body

    if (!gapId) {
      return NextResponse.json({ error: 'Missing gapId' }, { status: 400 })
    }

    const success = await resolveGap(gapId, session.user.id, resolutionNotes)

    if (!success) {
      return NextResponse.json({ error: 'Failed to resolve gap' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Gap résolu avec succès',
    })
  } catch (error) {
    console.error('❌ Erreur API active-learning/resolve:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
