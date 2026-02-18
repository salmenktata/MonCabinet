/**
 * API Route - Résultats d'évaluation RAG
 *
 * GET /api/admin/eval/results
 *   ?run_id=xxx     → résultats d'un run spécifique
 *   (sans params)   → liste des runs avec métriques agrégées
 *
 * @module app/api/admin/eval/results/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const runId = request.nextUrl.searchParams.get('run_id')

    if (runId) {
      // Résultats détaillés d'un run
      const result = await db.query(
        `SELECT * FROM rag_eval_results WHERE run_id = $1 ORDER BY question_id`,
        [runId]
      )

      // Métriques agrégées
      const agg = await db.query(
        `SELECT
           COUNT(*) as total,
           ROUND(AVG(recall_at_1)::numeric, 3) as avg_recall_1,
           ROUND(AVG(recall_at_3)::numeric, 3) as avg_recall_3,
           ROUND(AVG(recall_at_5)::numeric, 3) as avg_recall_5,
           ROUND(AVG(recall_at_10)::numeric, 3) as avg_recall_10,
           ROUND(AVG(precision_at_5)::numeric, 3) as avg_precision_5,
           ROUND(AVG(mrr)::numeric, 3) as avg_mrr,
           ROUND(AVG(faithfulness_score)::numeric, 3) as avg_faithfulness,
           ROUND(AVG(citation_accuracy)::numeric, 3) as avg_citation_accuracy,
           ROUND(AVG(latency_ms)::numeric, 0) as avg_latency_ms,
           COUNT(*) FILTER (WHERE recall_at_5 >= 0.8) as high_recall_count,
           COUNT(*) FILTER (WHERE recall_at_5 < 0.5 AND array_length(gold_chunk_ids, 1) > 0) as failed_count
         FROM rag_eval_results WHERE run_id = $1`,
        [runId]
      )

      return NextResponse.json({
        success: true,
        runId,
        summary: agg.rows[0],
        results: result.rows,
      })
    }

    // Liste des runs (historique)
    const runs = await db.query(
      `SELECT
         run_id,
         MIN(created_at) as started_at,
         COUNT(*) as total_questions,
         ROUND(AVG(recall_at_5)::numeric, 3) as avg_recall_5,
         ROUND(AVG(mrr)::numeric, 3) as avg_mrr,
         ROUND(AVG(faithfulness_score)::numeric, 3) as avg_faithfulness,
         ROUND(AVG(citation_accuracy)::numeric, 3) as avg_citation_accuracy,
         ROUND(AVG(latency_ms)::numeric, 0) as avg_latency_ms,
         COUNT(*) FILTER (WHERE recall_at_5 < 0.5 AND array_length(gold_chunk_ids, 1) > 0) as failed_count
       FROM rag_eval_results
       GROUP BY run_id
       ORDER BY MIN(created_at) DESC
       LIMIT 20`
    )

    return NextResponse.json({
      success: true,
      runs: runs.rows,
    })
  } catch (error) {
    console.error('[Eval Results] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
