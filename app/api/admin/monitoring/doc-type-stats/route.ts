/**
 * API : Statistiques par type de document (doc_type)
 *
 * GET /api/admin/monitoring/doc-type-stats
 * Retourne stats et breakdown depuis vues SQL
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

export async function GET() {
  try {
    // Vérifier authentification super-admin
    const session = await getSession()
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Query stats depuis vue SQL
    const statsResult = await db.query(`
      SELECT
        doc_type,
        total_docs,
        indexed_docs,
        avg_quality,
        total_chunks,
        indexation_rate
      FROM vw_kb_stats_by_doc_type
      ORDER BY total_docs DESC
    `)

    // Query breakdown depuis vue SQL
    const breakdownResult = await db.query(`
      SELECT
        doc_type,
        category,
        doc_count,
        indexed_count,
        avg_quality
      FROM vw_kb_doc_type_breakdown
      ORDER BY doc_type, doc_count DESC
    `)

    return NextResponse.json({
      stats: statsResult.rows,
      breakdown: breakdownResult.rows,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('❌ Erreur récupération stats doc_type:', error)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
