/**
 * API Route - Lancer un benchmark d'évaluation RAG
 *
 * POST /api/admin/eval/run
 *   Body: { mode: 'quick'|'full', llmJudge?: boolean }
 *
 * Exécute le benchmark en background et retourne un run_id.
 * Les résultats sont consultables via GET /api/admin/eval/results?run_id=xxx
 *
 * GET /api/admin/eval/run?run_id=xxx → statut d'un run en cours
 *
 * @module app/api/admin/eval/run/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { generateEmbedding, formatEmbeddingForPostgres } from '@/lib/ai/embeddings-service'
import {
  computeRecallAtK,
  computePrecisionAtK,
  computeMRR,
  computeCitationAccuracy,
  computeFaithfulness,
} from '@/lib/ai/rag-eval-metrics'
import { computeFaithfulnessLLM } from '@/lib/ai/rag-eval-judge'

export const dynamic = 'force-dynamic'

// Tracker des runs en cours (in-memory, suffisant pour single instance)
const activeRuns = new Map<string, { status: 'running' | 'done' | 'error'; progress: number; total: number; error?: string }>()

interface GoldEvalCase {
  id: string
  domain: string
  difficulty: string
  question: string
  intentType: string
  expectedAnswer: { keyPoints: string[]; mandatoryCitations: string[] }
  expectedArticles?: string[]
  goldChunkIds?: string[]
  goldDocumentIds?: string[]
}

// =============================================================================
// POST — Lancer un benchmark
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const mode = body.mode || 'quick'
    const llmJudge = body.llmJudge || false

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

    // Lancer en background (ne pas bloquer la requête HTTP)
    runBenchmarkAsync(runId, goldCases, llmJudge).catch(err => {
      console.error(`[Eval Run ${runId}] Erreur fatale:`, err)
      activeRuns.set(runId, { status: 'error', progress: 0, total: goldCases.length, error: err.message })
    })

    return NextResponse.json({
      success: true,
      runId,
      mode,
      llmJudge,
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

    // Vérifier en DB si le run existe
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

async function runBenchmarkAsync(runId: string, goldCases: GoldEvalCase[], llmJudge: boolean) {
  for (let i = 0; i < goldCases.length; i++) {
    const evalCase = goldCases[i]

    try {
      const startTime = Date.now()

      // Hybrid search via embedding
      const embeddingResult = await generateEmbedding(evalCase.question)
      const embeddingStr = formatEmbeddingForPostgres(embeddingResult.embedding)

      const searchResult = await db.query(
        `SELECT
           kbc.id as chunk_id,
           kbc.knowledge_base_id as document_id,
           kbc.content,
           kb.title,
           1 - (kbc.embedding_openai <=> $1::vector) as similarity
         FROM knowledge_base_chunks kbc
         JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
         WHERE kb.is_indexed = true AND kbc.embedding_openai IS NOT NULL
         ORDER BY kbc.embedding_openai <=> $1::vector
         LIMIT 10`,
        [embeddingStr]
      )

      const latencyMs = Date.now() - startTime
      const retrievedChunkIds = searchResult.rows.map((r: any) => r.chunk_id)
      const retrievedDocIds = searchResult.rows.map((r: any) => r.document_id)
      const goldChunkIds = evalCase.goldChunkIds || []
      const goldDocIds = evalCase.goldDocumentIds || []
      const goldIdsForRecall = goldChunkIds.length > 0 ? goldChunkIds : goldDocIds
      const retrievedIdsForRecall = goldChunkIds.length > 0 ? retrievedChunkIds : retrievedDocIds

      const simulatedAnswer = searchResult.rows.map((r: any) => (r.content as string).substring(0, 500)).join('\n')

      let faithfulnessScore: number
      if (llmJudge) {
        const judgement = await computeFaithfulnessLLM(evalCase.question, simulatedAnswer, evalCase.expectedAnswer.keyPoints)
        faithfulnessScore = judgement.score
      } else {
        faithfulnessScore = computeFaithfulness(evalCase.question, simulatedAnswer, evalCase.expectedAnswer.keyPoints)
      }

      await db.query(
        `INSERT INTO rag_eval_results (
          run_id, question_id, question, language, domain, difficulty,
          gold_chunk_ids, retrieved_chunk_ids,
          recall_at_1, recall_at_3, recall_at_5, recall_at_10,
          precision_at_5, mrr, faithfulness_score, citation_accuracy,
          expected_answer, actual_answer, sources_returned, latency_ms
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          runId, evalCase.id, evalCase.question,
          /[\u0600-\u06FF]/.test(evalCase.question) ? 'ar' : 'fr',
          evalCase.domain, evalCase.difficulty,
          goldIdsForRecall, retrievedChunkIds,
          computeRecallAtK(goldIdsForRecall, retrievedIdsForRecall, 1),
          computeRecallAtK(goldIdsForRecall, retrievedIdsForRecall, 3),
          computeRecallAtK(goldIdsForRecall, retrievedIdsForRecall, 5),
          computeRecallAtK(goldIdsForRecall, retrievedIdsForRecall, 10),
          computePrecisionAtK(goldIdsForRecall, retrievedIdsForRecall, 5),
          computeMRR(goldIdsForRecall, retrievedIdsForRecall),
          faithfulnessScore,
          computeCitationAccuracy(simulatedAnswer, evalCase.expectedArticles || []),
          evalCase.expectedAnswer.keyPoints.join(' | '),
          simulatedAnswer.substring(0, 1000),
          JSON.stringify(searchResult.rows.map((r: any) => ({ id: r.chunk_id, title: r.title, score: parseFloat(r.similarity) }))),
          latencyMs,
        ]
      )

      activeRuns.set(runId, { status: 'running', progress: i + 1, total: goldCases.length })
    } catch (error) {
      console.error(`[Eval Run] Erreur question ${evalCase.id}:`, error instanceof Error ? error.message : error)
    }
  }

  activeRuns.set(runId, { status: 'done', progress: goldCases.length, total: goldCases.length })
  console.log(`[Eval Run] Benchmark ${runId} terminé: ${goldCases.length} questions`)
}
