/**
 * API Content Review - Approve
 *
 * POST /api/admin/content-review/approve
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { approveReview } from '@/lib/content/review-service'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { reviewId, comments } = body

    if (!reviewId) {
      return NextResponse.json({ error: 'Missing reviewId' }, { status: 400 })
    }

    const success = await approveReview(reviewId, session.user.id, comments)

    if (!success) {
      return NextResponse.json({ error: 'Failed to approve review' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Review approuvée avec succès',
    })
  } catch (error) {
    console.error('❌ Erreur API content-review/approve:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
