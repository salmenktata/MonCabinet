/**
 * GET /api/admin/monitoring/costs
 *
 * Retourne le résumé des coûts IA par conversation.
 * Paramètres : ?days=30&top=10
 *
 * @module app/api/admin/monitoring/costs/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getCostSummary, getTopCostlyConversations } from '@/lib/ai/conversation-cost-service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10)
    const top = parseInt(request.nextUrl.searchParams.get('top') || '10', 10)

    const [summary, topConversations] = await Promise.all([
      getCostSummary(days),
      getTopCostlyConversations(top, days),
    ])

    return NextResponse.json({
      success: true,
      summary,
      topConversations,
      periodDays: days,
    }, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('[Monitoring Costs] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
