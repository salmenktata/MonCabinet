/**
 * API Route - Comparaison A/B de deux runs d'évaluation RAG
 *
 * GET /api/admin/eval/compare?run_a=xxx&run_b=yyy
 *
 * Retourne: agrégats des 2 runs, deltas, diff par question, diff par domaine,
 * et flag regressionDetected si Recall@5 ou MRR chute > 5%.
 *
 * @module app/api/admin/eval/compare/route
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

    const runA = request.nextUrl.searchParams.get('run_a')
    const runB = request.nextUrl.searchParams.get('run_b')

    if (!runA || !runB) {
      return NextResponse.json({ error: 'run_a et run_b requis' }, { status: 400 })
    }

    // Agrégats des 2 runs
    const aggQuery = `
      SELECT
        run_id,
        COUNT(*) as total_questions,
        ROUND(AVG(recall_at_5)::numeric, 4) as avg_recall_5,
        ROUND(AVG(mrr)::numeric, 4) as avg_mrr,
        ROUND(AVG(faithfulness_score)::numeric, 4) as avg_faithfulness,
        ROUND(AVG(citation_accuracy)::numeric, 4) as avg_citation_accuracy,
        ROUND(AVG(latency_ms)::numeric, 0) as avg_latency_ms,
        ROUND(AVG(judge_score)::numeric, 4) as avg_judge_score,
        MAX(run_label) as run_label,
        MAX(run_mode) as run_mode
      FROM rag_eval_results
      WHERE run_id IN ($1, $2)
      GROUP BY run_id`

    const aggResult = await db.query(aggQuery, [runA, runB])

    const rowA = aggResult.rows.find((r: any) => r.run_id === runA)
    const rowB = aggResult.rows.find((r: any) => r.run_id === runB)

    if (!rowA || !rowB) {
      return NextResponse.json({ error: 'Un ou les deux runs non trouvés' }, { status: 404 })
    }

    const parseNum = (v: any) => v !== null && v !== undefined ? parseFloat(String(v)) : null
    const safeNum = (v: any) => parseNum(v) ?? 0

    const metricsA = {
      avg_recall_5: safeNum(rowA.avg_recall_5),
      avg_mrr: safeNum(rowA.avg_mrr),
      avg_faithfulness: safeNum(rowA.avg_faithfulness),
      avg_citation_accuracy: safeNum(rowA.avg_citation_accuracy),
      avg_latency_ms: safeNum(rowA.avg_latency_ms),
      avg_judge_score: parseNum(rowA.avg_judge_score),
      total_questions: parseInt(rowA.total_questions),
    }

    const metricsB = {
      avg_recall_5: safeNum(rowB.avg_recall_5),
      avg_mrr: safeNum(rowB.avg_mrr),
      avg_faithfulness: safeNum(rowB.avg_faithfulness),
      avg_citation_accuracy: safeNum(rowB.avg_citation_accuracy),
      avg_latency_ms: safeNum(rowB.avg_latency_ms),
      avg_judge_score: parseNum(rowB.avg_judge_score),
      total_questions: parseInt(rowB.total_questions),
    }

    const deltas = {
      avg_recall_5: metricsB.avg_recall_5 - metricsA.avg_recall_5,
      avg_mrr: metricsB.avg_mrr - metricsA.avg_mrr,
      avg_faithfulness: metricsB.avg_faithfulness - metricsA.avg_faithfulness,
      avg_citation_accuracy: metricsB.avg_citation_accuracy - metricsA.avg_citation_accuracy,
      avg_latency_ms: metricsB.avg_latency_ms - metricsA.avg_latency_ms,
      avg_judge_score: metricsA.avg_judge_score !== null && metricsB.avg_judge_score !== null
        ? metricsB.avg_judge_score - metricsA.avg_judge_score
        : null,
      total_questions: metricsB.total_questions - metricsA.total_questions,
    }

    // Régression si B est pire que A de > 5%
    const regressionDetected =
      deltas.avg_recall_5 < -0.05 || deltas.avg_mrr < -0.05

    // Diff par question (questions communes)
    const perQuestionResult = await db.query(
      `SELECT
         a.question_id,
         a.question,
         a.domain,
         a.recall_at_5 as recall_5_a,
         b.recall_at_5 as recall_5_b,
         a.mrr as mrr_a,
         b.mrr as mrr_b,
         (b.recall_at_5 - a.recall_at_5) as delta_recall_5,
         (b.mrr - a.mrr) as delta_mrr
       FROM rag_eval_results a
       JOIN rag_eval_results b ON a.question_id = b.question_id
       WHERE a.run_id = $1 AND b.run_id = $2
       ORDER BY ABS(b.recall_at_5 - a.recall_at_5) + ABS(b.mrr - a.mrr) DESC`,
      [runA, runB]
    )

    // Diff par domaine
    const perDomainResult = await db.query(
      `SELECT
         COALESCE(a.domain, b.domain) as domain,
         COALESCE(a.avg_recall_5, 0) as recall_5_a,
         COALESCE(b.avg_recall_5, 0) as recall_5_b,
         COALESCE(a.avg_mrr, 0) as mrr_a,
         COALESCE(b.avg_mrr, 0) as mrr_b,
         COALESCE(b.avg_recall_5, 0) - COALESCE(a.avg_recall_5, 0) as delta_recall_5,
         COALESCE(b.avg_mrr, 0) - COALESCE(a.avg_mrr, 0) as delta_mrr
       FROM (
         SELECT domain, ROUND(AVG(recall_at_5)::numeric, 4) as avg_recall_5, ROUND(AVG(mrr)::numeric, 4) as avg_mrr
         FROM rag_eval_results WHERE run_id = $1 GROUP BY domain
       ) a
       FULL OUTER JOIN (
         SELECT domain, ROUND(AVG(recall_at_5)::numeric, 4) as avg_recall_5, ROUND(AVG(mrr)::numeric, 4) as avg_mrr
         FROM rag_eval_results WHERE run_id = $2 GROUP BY domain
       ) b ON a.domain = b.domain
       ORDER BY ABS(COALESCE(b.avg_recall_5, 0) - COALESCE(a.avg_recall_5, 0)) DESC`,
      [runA, runB]
    )

    return NextResponse.json({
      success: true,
      runA: { run_id: runA, label: rowA.run_label, mode: rowA.run_mode, metrics: metricsA },
      runB: { run_id: runB, label: rowB.run_label, mode: rowB.run_mode, metrics: metricsB },
      deltas,
      regressionDetected,
      perQuestion: perQuestionResult.rows,
      perDomain: perDomainResult.rows,
    })
  } catch (error) {
    console.error('[Eval Compare] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
