/**
 * API A/B Testing - Liste tests
 *
 * GET /api/admin/ab-testing/tests
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getActiveTests } from '@/lib/ai/ab-testing-service'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tests = await getActiveTests()

    return NextResponse.json({
      success: true,
      tests,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('❌ Erreur API ab-testing/tests:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
