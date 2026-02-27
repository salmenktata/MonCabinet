/**
 * API Route - Lancer un benchmark d'évaluation RAG (V2)
 *
 * POST /api/admin/eval/run
 *   Body: { mode: 'quick'|'full', runMode: 'retrieval'|'e2e'|'e2e+judge', label?: string }
 *
 * GET /api/admin/eval/run?run_id=xxx → statut d'un run en cours
 *
 * V2: Utilise searchKnowledgeBaseHybrid() (vrai pipeline triple-embed)
 *     au lieu du SQL brut. Supporte 3 modes de run et le labeling A/B.
 *
 * @module app/api/admin/eval/run/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { searchKnowledgeBaseHybrid } from '@/lib/ai/knowledge-base-service'
import { answerQuestion } from '@/lib/ai/rag-chat-service'
import { enrichQueryWithLegalSynonyms } from '@/lib/ai/query-expansion-service'
import {
  computeRecallAtK,
  computePrecisionAtK,
  computeMRR,
  computeCitationAccuracy,
  computeFaithfulness,
} from '@/lib/ai/rag-eval-metrics'
import { computeFaithfulnessLLM } from '@/lib/ai/rag-eval-judge'
import type { GoldEvalCase, RunMode } from '@/lib/ai/rag-eval-types'

export const dynamic = 'force-dynamic'

// Tracker des runs en cours (in-memory, suffisant pour single instance)
const activeRuns = new Map<string, { status: 'running' | 'done' | 'error'; progress: number; total: number; error?: string }>()

// =============================================================================
// POST — Lancer un benchmark
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Auth : session admin OU CRON_SECRET
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    const body = await request.json()
    const bodySecret = (body as Record<string, unknown>)?.secret

    const isCronAuth = cronSecret && (authHeader === `Bearer ${cronSecret}` || bodySecret === cronSecret)

    if (!isCronAuth) {
      const session = await getSession()
      if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'super_admin')) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
      }
    }
    const mode = body.mode || 'quick'
    const runMode: RunMode = body.runMode || 'retrieval'
    const label: string | undefined = body.label

    const goldPath = path.join(process.cwd(), 'data', 'gold-eval-dataset.json')
    if (!fs.existsSync(goldPath)) {
      return NextResponse.json({ error: 'Gold dataset non trouvé' }, { status: 404 })
    }

    let goldCases: GoldEvalCase[] = JSON.parse(fs.readFileSync(goldPath, 'utf-8'))

    if (mode === 'quick') {
      goldCases = goldCases.slice(0, 20)
    }

    const runId = `eval_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomBytes(4).toString('hex')}`

    activeRuns.set(runId, { status: 'running', progress: 0, total: goldCases.length })

    // Lancer en background
    runBenchmarkAsync(runId, goldCases, runMode, label).catch(err => {
      console.error(`[Eval Run ${runId}] Erreur fatale:`, err)
      activeRuns.set(runId, { status: 'error', progress: 0, total: goldCases.length, error: err.message })
    })

    return NextResponse.json({
      success: true,
      runId,
      mode,
      runMode,
      label,
      totalQuestions: goldCases.length,
    })
  } catch (error) {
    console.error('[Eval Run] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

// =============================================================================
// GET — Statut d'un run
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const runId = request.nextUrl.searchParams.get('run_id')
    if (!runId) {
      return NextResponse.json({ error: 'run_id requis' }, { status: 400 })
    }

    const tracker = activeRuns.get(runId)
    if (tracker) {
      return NextResponse.json({ success: true, ...tracker, runId })
    }

    const dbCheck = await db.query(
      `SELECT COUNT(*) as count FROM rag_eval_results WHERE run_id = $1`,
      [runId]
    )

    if (parseInt(dbCheck.rows[0].count) > 0) {
      return NextResponse.json({ success: true, status: 'done', runId, progress: parseInt(dbCheck.rows[0].count), total: parseInt(dbCheck.rows[0].count) })
    }

    return NextResponse.json({ error: 'Run non trouvé' }, { status: 404 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

// =============================================================================
// BACKGROUND RUNNER
// =============================================================================

async function runBenchmarkAsync(runId: string, goldCases: GoldEvalCase[], runMode: RunMode, label?: string) {
  for (let i = 0; i < goldCases.length; i++) {
    const evalCase = goldCases[i]

    try {
      // ===== RETRIEVAL: vrai pipeline hybride =====
      const retrievalStart = Date.now()

      // Enrichir la query comme le fait le pipeline de production (synonymes bilingues FR↔AR)
      const enrichedQuestion = enrichQueryWithLegalSynonyms(evalCase.question)
      const searchResults = await searchKnowledgeBaseHybrid(enrichedQuestion, {
        limit: 30, // P1 fix Feb 25: 10→30 — KB a grandi de 33K→45K chunks, pool élargi pour meilleur recall@5/10
        operationName: 'assistant-ia',
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

      // Métriques retrieval
      const recall1 = computeRecallAtK(goldIdsForRecall, retrievedIdsForRecall, 1)
      const recall3 = computeRecallAtK(goldIdsForRecall, retrievedIdsForRecall, 3)
      const recall5 = computeRecallAtK(goldIdsForRecall, retrievedIdsForRecall, 5)
      const recall10 = computeRecallAtK(goldIdsForRecall, retrievedIdsForRecall, 10)
      const precision5 = computePrecisionAtK(goldIdsForRecall, retrievedIdsForRecall, 5)
      const mrr = computeMRR(goldIdsForRecall, retrievedIdsForRecall)

      // Defaults pour e2e
      let actualAnswer = searchResults.map(r => r.chunkContent.substring(0, 500)).join('\n')
      let faithfulnessScore = computeFaithfulness(evalCase.question, actualAnswer, evalCase.expectedAnswer.keyPoints)
      let citationAccuracy = computeCitationAccuracy(actualAnswer, evalCase.expectedArticles || [])
      let answerLatencyMs: number | null = null
      let abstentionReason: string | null = null
      let qualityIndicator: string | null = null
      let judgeScore: number | null = null
      let judgeReasoning: string | null = null
      let judgeCoveredPoints: number | null = null
      let judgeTotalPoints: number | null = null

      // ===== E2E: génération LLM =====
      if (runMode === 'e2e' || runMode === 'e2e+judge') {
        try {
          const answerStart = Date.now()

          const chatResponse = await answerQuestion(evalCase.question, 'eval-system', {
            operationName: 'assistant-ia', // Explicit: Gemini 2.0 Flash (évite routing via Groq circuit ouvert)
          })

          answerLatencyMs = Date.now() - answerStart
          actualAnswer = chatResponse.answer
          abstentionReason = chatResponse.abstentionReason || null

          // Faithfulness keyword sur vraie réponse
          faithfulnessScore = computeFaithfulness(evalCase.question, actualAnswer, evalCase.expectedAnswer.keyPoints)
          citationAccuracy = computeCitationAccuracy(actualAnswer, evalCase.expectedArticles || [])

          // Quality indicator basé sur les sources
          if (chatResponse.sources.length === 0) {
            qualityIndicator = 'no_sources'
          } else if (chatResponse.abstentionReason) {
            qualityIndicator = 'abstention'
          } else {
            qualityIndicator = 'ok'
          }
        } catch (e2eError) {
          console.error(`[Eval Run] E2E erreur ${evalCase.id}:`, e2eError instanceof Error ? e2eError.message : e2eError)
          qualityIndicator = 'e2e_error'
        }
      }

      // ===== JUDGE: évaluation LLM =====
      if (runMode === 'e2e+judge') {
        try {
          const judgement = await computeFaithfulnessLLM(evalCase.question, actualAnswer, evalCase.expectedAnswer.keyPoints)
          judgeScore = judgement.score
          judgeReasoning = judgement.reasoning
          judgeCoveredPoints = judgement.coveredPoints
          judgeTotalPoints = judgement.totalPoints
        } catch (judgeError) {
          console.error(`[Eval Run] Judge erreur ${evalCase.id}:`, judgeError instanceof Error ? judgeError.message : judgeError)
        }
      }

      const totalLatencyMs = retrievalLatencyMs + (answerLatencyMs || 0)

      await db.query(
        `INSERT INTO rag_eval_results (
          run_id, question_id, question, language, domain, difficulty,
          gold_chunk_ids, retrieved_chunk_ids,
          recall_at_1, recall_at_3, recall_at_5, recall_at_10,
          precision_at_5, mrr, faithfulness_score, citation_accuracy,
          expected_answer, actual_answer, sources_returned, latency_ms,
          run_label, run_mode, retrieval_latency_ms, answer_latency_ms,
          judge_score, judge_reasoning, judge_covered_points, judge_total_points,
          abstention_reason, quality_indicator, avg_similarity
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
        [
          runId, evalCase.id, evalCase.question,
          /[\u0600-\u06FF]/.test(evalCase.question) ? 'ar' : 'fr',
          evalCase.domain, evalCase.difficulty,
          goldIdsForRecall, retrievedChunkIds,
          recall1, recall3, recall5, recall10,
          precision5, mrr, faithfulnessScore, citationAccuracy,
          evalCase.expectedAnswer.keyPoints.join(' | '),
          actualAnswer.substring(0, 2000),
          JSON.stringify(searchResults.map(r => ({ id: r.chunkId, title: r.title, score: r.similarity }))),
          totalLatencyMs,
          label || null, runMode, retrievalLatencyMs, answerLatencyMs,
          judgeScore, judgeReasoning, judgeCoveredPoints, judgeTotalPoints,
          abstentionReason, qualityIndicator, avgSimilarity,
        ]
      )

      activeRuns.set(runId, { status: 'running', progress: i + 1, total: goldCases.length })
    } catch (error) {
      console.error(`[Eval Run] Erreur question ${evalCase.id}:`, error instanceof Error ? error.message : error)
    }
  }

  activeRuns.set(runId, { status: 'done', progress: goldCases.length, total: goldCases.length })
  console.log(`[Eval Run] Benchmark ${runId} terminé: ${goldCases.length} questions (mode: ${runMode}${label ? `, label: ${label}` : ''})`)
}
