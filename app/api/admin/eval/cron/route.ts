/**
 * API Route - Cron Évaluation RAG Hebdomadaire (V2)
 *
 * POST /api/admin/eval/cron
 * Auth: session super_admin OU CRON_SECRET
 *
 * V2: Utilise searchKnowledgeBaseHybrid() (vrai pipeline triple-embed)
 *     Stocke les nouvelles colonnes V2 (run_label, run_mode, avg_similarity, etc.)
 *
 * @module app/api/admin/eval/cron/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { searchKnowledgeBaseHybrid } from '@/lib/ai/knowledge-base-service'
import {
  computeRecallAtK,
  computePrecisionAtK,
  computeMRR,
  computeCitationAccuracy,
  computeFaithfulness,
} from '@/lib/ai/rag-eval-metrics'
import type { GoldEvalCase } from '@/lib/ai/rag-eval-types'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export const POST = withAdminApiAuth(async (_request: NextRequest, _ctx, _session) => {
  try {
    const startTime = Date.now()

    const goldPath = path.join(process.cwd(), 'data', 'gold-eval-dataset.json')
    if (!fs.existsSync(goldPath)) {
      return NextResponse.json({ error: 'Gold dataset non trouvé' }, { status: 404 })
    }

    const allCases: GoldEvalCase[] = JSON.parse(fs.readFileSync(goldPath, 'utf-8'))

    // 20 questions aléatoires
    const shuffled = allCases.sort(() => Math.random() - 0.5)
    const selectedCases = shuffled.slice(0, 20)

    const runId = `cron_eval_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomBytes(4).toString('hex')}`

    const results: Array<{ recall_at_5: number; mrr: number; faithfulness_score: number }> = []

    for (const evalCase of selectedCases) {
      try {
        const retrievalStart = Date.now()

        // Vrai pipeline hybride (triple-embed, BM25, re-ranking)
        const searchResults = await searchKnowledgeBaseHybrid(evalCase.question, {
          limit: 10,
          operationName: 'eval-cron-weekly',
        })

        const retrievalLatencyMs = Date.now() - retrievalStart

        const retrievedChunkIds = searchResults.map(r => r.chunkId)
        const retrievedDocIds = searchResults.map(r => r.knowledgeBaseId)
        const avgSimilarity = searchResults.length > 0
          ? searchResults.reduce((sum, r) => sum + r.similarity, 0) / searchResults.length
          : 0

        const goldChunkIds = evalCase.goldChunkIds || []
        const goldDocIds = evalCase.goldDocumentIds || []
        const goldIdsForRecall = goldChunkIds.length > 0 ? goldChunkIds : goldDocIds
        const retrievedIdsForRecall = goldChunkIds.length > 0 ? retrievedChunkIds : retrievedDocIds

        const simulatedAnswer = searchResults.map(r => r.chunkContent.substring(0, 500)).join('\n')

        const recall5 = computeRecallAtK(goldIdsForRecall, retrievedIdsForRecall, 5)
        const mrrVal = computeMRR(goldIdsForRecall, retrievedIdsForRecall)
        const faith = computeFaithfulness(evalCase.question, simulatedAnswer, evalCase.expectedAnswer.keyPoints)

        results.push({ recall_at_5: recall5, mrr: mrrVal, faithfulness_score: faith })

        await db.query(
          `INSERT INTO rag_eval_results (
            run_id, question_id, question, language, domain, difficulty,
            gold_chunk_ids, retrieved_chunk_ids,
            recall_at_1, recall_at_3, recall_at_5, recall_at_10,
            precision_at_5, mrr, faithfulness_score, citation_accuracy,
            expected_answer, actual_answer, sources_returned, latency_ms,
            run_label, run_mode, retrieval_latency_ms, avg_similarity
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
          [
            runId, evalCase.id, evalCase.question,
            /[\u0600-\u06FF]/.test(evalCase.question) ? 'ar' : 'fr',
            evalCase.domain, evalCase.difficulty,
            goldIdsForRecall, retrievedChunkIds,
            computeRecallAtK(goldIdsForRecall, retrievedIdsForRecall, 1),
            computeRecallAtK(goldIdsForRecall, retrievedIdsForRecall, 3),
            recall5,
            computeRecallAtK(goldIdsForRecall, retrievedIdsForRecall, 10),
            computePrecisionAtK(goldIdsForRecall, retrievedIdsForRecall, 5),
            mrrVal, faith,
            computeCitationAccuracy(simulatedAnswer, evalCase.expectedArticles || []),
            evalCase.expectedAnswer.keyPoints.join(' | '),
            simulatedAnswer.substring(0, 1000),
            JSON.stringify(searchResults.map(r => ({ id: r.chunkId, title: r.title, score: r.similarity }))),
            retrievalLatencyMs,
            'cron-weekly', 'retrieval', retrievalLatencyMs, avgSimilarity,
          ]
        )
      } catch (error) {
        console.error(`[Eval Cron] Erreur question ${evalCase.id}:`, error instanceof Error ? error.message : error)
      }
    }

    // Métriques agrégées
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
    const currentRecall5 = avg(results.map(r => r.recall_at_5))
    const currentMRR = avg(results.map(r => r.mrr))
    const currentFaith = avg(results.map(r => r.faithfulness_score))

    // Comparer avec le run précédent
    const previousRun = await db.query(
      `SELECT
         ROUND(AVG(recall_at_5)::numeric, 3) as avg_recall_5,
         ROUND(AVG(mrr)::numeric, 3) as avg_mrr,
         ROUND(AVG(faithfulness_score)::numeric, 3) as avg_faithfulness
       FROM rag_eval_results
       WHERE run_id != $1
       GROUP BY run_id
       ORDER BY MIN(created_at) DESC
       LIMIT 1`,
      [runId]
    )

    let regressionDetected = false
    let regressionDetails = ''

    if (previousRun.rows.length > 0) {
      const prev = previousRun.rows[0]
      const prevRecall5 = parseFloat(prev.avg_recall_5)
      const prevMRR = parseFloat(prev.avg_mrr)

      const recall5Drop = prevRecall5 - currentRecall5
      const mrrDrop = prevMRR - currentMRR

      if (recall5Drop > 0.05 || mrrDrop > 0.05) {
        regressionDetected = true
        regressionDetails = `Recall@5: ${(prevRecall5 * 100).toFixed(1)}% → ${(currentRecall5 * 100).toFixed(1)}% (${recall5Drop > 0 ? '-' : '+'}${(Math.abs(recall5Drop) * 100).toFixed(1)}%), MRR: ${(prevMRR * 100).toFixed(1)}% → ${(currentMRR * 100).toFixed(1)}% (${mrrDrop > 0 ? '-' : '+'}${(Math.abs(mrrDrop) * 100).toFixed(1)}%)`
      }
    }

    // Alerte email si régression
    if (regressionDetected && process.env.BREVO_API_KEY) {
      try {
        await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': process.env.BREVO_API_KEY,
          },
          body: JSON.stringify({
            sender: { name: 'Qadhya Monitoring', email: 'noreply@qadhya.tn' },
            to: [{ email: process.env.ALERT_EMAIL || 'admin@qadhya.tn', name: 'Admin' }],
            subject: `[WARNING] Régression RAG détectée — ${runId}`,
            htmlContent: `<h2>Régression RAG détectée</h2><p>${regressionDetails}</p><p>Run: ${runId}</p><p>Consultez le dashboard: <a href="https://qadhya.tn/super-admin/evaluation">Évaluation RAG</a></p>`,
          }),
        })
        console.log('[Eval Cron] Alerte régression envoyée')
      } catch (emailError) {
        console.error('[Eval Cron] Erreur envoi alerte:', emailError)
      }
    }

    // Log cron execution
    try {
      await db.query(
        `INSERT INTO cron_executions (cron_name, status, started_at, completed_at, duration_ms, output, triggered_by)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6)`,
        [
          'eval-rag-weekly',
          'success',
          new Date(startTime),
          Date.now() - startTime,
          JSON.stringify({
            runId,
            questions: results.length,
            avgRecall5: currentRecall5.toFixed(3),
            avgMRR: currentMRR.toFixed(3),
            avgFaithfulness: currentFaith.toFixed(3),
            regressionDetected,
          }),
          'cron',
        ]
      )
    } catch {
      // Ignore si table cron_executions n'existe pas
    }

    const durationMs = Date.now() - startTime

    return NextResponse.json({
      success: true,
      runId,
      questionsEvaluated: results.length,
      metrics: {
        avgRecall5: currentRecall5,
        avgMRR: currentMRR,
        avgFaithfulness: currentFaith,
      },
      regressionDetected,
      regressionDetails: regressionDetails || undefined,
      durationMs,
    })
  } catch (error) {
    console.error('[Eval Cron] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
