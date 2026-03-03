/**
 * API Route: Benchmark du système de détection d'amendements JORT
 *
 * GET /api/admin/amendments/benchmark
 * - Charge data/gold-amendments-dataset.json
 * - Pour chaque cas avec jortKbId disponible, lance le pipeline complet
 * - Calcule Precision / Recall / F1 + métriques d'extraction
 * - Retourne les métriques détaillées
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { getSession } from '@/lib/auth/session'
import { verifyCronSecret } from '@/lib/auth/verify-cron-secret'
import { db } from '@/lib/db/postgres'
import { getKnowledgeDocument } from '@/lib/ai/knowledge-base-service'
import { extractAmendmentsFromJORT, isLikelyAmendingDocument } from '@/lib/knowledge-base/jort-amendment-extractor'
import goldDataset from '@/data/gold-amendments-dataset.json'

// =============================================================================
// AUTH
// =============================================================================

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  return ['admin', 'super_admin'].includes(result.rows[0]?.role)
}

// =============================================================================
// HELPERS — métriques
// =============================================================================

function jaccardSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 && b.length === 0) return 1
  const setA = new Set(a)
  const setB = new Set(b)
  const intersection = [...setA].filter((x) => setB.has(x)).length
  const union = new Set([...a, ...b]).size
  return union === 0 ? 1 : intersection / union
}

// =============================================================================
// GET — Calcul des métriques benchmark
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization')
    if (!verifyCronSecret(authHeader)) {
      const session = await getSession()
      if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

      const isAdmin = await checkAdminAccess(session.user.id)
      if (!isAdmin) return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const cases = (goldDataset as any).cases as Array<{
      id: string
      jortKbId: string | null
      jortTitle: string
      isAmending: boolean
      expectedCode: string | null
      expectedArticles: number[]
      expectedType: string | null
      expectedDate: string | null
    }>

    // Filtrer les cas avec jortKbId disponible
    const runnableCases = cases.filter((c) => c.jortKbId)

    const caseResults: Array<{
      id: string
      title: string
      expected: {
        isAmending: boolean
        code: string | null
        articles: number[]
        type: string | null
        date: string | null
      }
      detected: {
        preFilter: boolean
        isAmending: boolean
        code: string | null
        articles: number[]
        type: string | null
        date: string | null
        confidence: number | null
        method: string | null
      }
      outcome: 'TP' | 'TN' | 'FP' | 'FN'
      preFilterOutcome: 'TP' | 'TN' | 'FP' | 'FN'
      extractionScores: {
        codeCorrect: boolean | null
        articlesJaccard: number | null
        typeCorrect: boolean | null
        dateCorrect: boolean | null
      }
      error: string | null
    }> = []

    for (const c of runnableCases) {
      try {
        const kbDoc = await getKnowledgeDocument(c.jortKbId!)
        if (!kbDoc) {
          caseResults.push({
            id: c.id,
            title: c.jortTitle,
            expected: { isAmending: c.isAmending, code: c.expectedCode, articles: c.expectedArticles, type: c.expectedType, date: c.expectedDate },
            detected: { preFilter: false, isAmending: false, code: null, articles: [], type: null, date: null, confidence: null, method: null },
            outcome: c.isAmending ? 'FN' : 'TN',
            preFilterOutcome: c.isAmending ? 'FN' : 'TN',
            extractionScores: { codeCorrect: null, articlesJaccard: null, typeCorrect: null, dateCorrect: null },
            error: 'Document introuvable dans la KB',
          })
          continue
        }

        const preFilter = isLikelyAmendingDocument(kbDoc.fullText ?? '', kbDoc.title)

        // Pre-filter outcome
        const preFilterOutcome: 'TP' | 'TN' | 'FP' | 'FN' = c.isAmending
          ? preFilter ? 'TP' : 'FN'
          : preFilter ? 'FP' : 'TN'

        if (!preFilter) {
          caseResults.push({
            id: c.id,
            title: c.jortTitle,
            expected: { isAmending: c.isAmending, code: c.expectedCode, articles: c.expectedArticles, type: c.expectedType, date: c.expectedDate },
            detected: { preFilter: false, isAmending: false, code: null, articles: [], type: null, date: null, confidence: null, method: null },
            outcome: c.isAmending ? 'FN' : 'TN',
            preFilterOutcome,
            extractionScores: { codeCorrect: null, articlesJaccard: null, typeCorrect: null, dateCorrect: null },
            error: null,
          })
          continue
        }

        const extraction = await extractAmendmentsFromJORT(kbDoc)
        const primary = extraction.amendments[0] ?? null

        const detectedCode = primary?.targetCodeSlug ?? null
        const detectedArticles = primary?.affectedArticles ?? []
        const detectedType = primary?.amendmentType ?? null
        const detectedDate = extraction.jortDate || null
        const detectedAmending = extraction.isAmendingDocument

        // Full pipeline outcome
        const outcome: 'TP' | 'TN' | 'FP' | 'FN' = c.isAmending
          ? detectedAmending ? 'TP' : 'FN'
          : detectedAmending ? 'FP' : 'TN'

        // Extraction scores (seulement pour les vrais positifs)
        let extractionScores = { codeCorrect: null as boolean | null, articlesJaccard: null as number | null, typeCorrect: null as boolean | null, dateCorrect: null as boolean | null }
        if (c.isAmending && detectedAmending) {
          extractionScores = {
            codeCorrect: c.expectedCode ? detectedCode === c.expectedCode : null,
            articlesJaccard: c.expectedArticles.length > 0
              ? jaccardSimilarity(c.expectedArticles, detectedArticles)
              : null,
            typeCorrect: c.expectedType ? detectedType === c.expectedType : null,
            dateCorrect: c.expectedDate ? detectedDate === c.expectedDate : null,
          }
        }

        caseResults.push({
          id: c.id,
          title: c.jortTitle,
          expected: { isAmending: c.isAmending, code: c.expectedCode, articles: c.expectedArticles, type: c.expectedType, date: c.expectedDate },
          detected: { preFilter: true, isAmending: detectedAmending, code: detectedCode, articles: detectedArticles, type: detectedType, date: detectedDate, confidence: extraction.confidence, method: extraction.extractionMethod },
          outcome,
          preFilterOutcome,
          extractionScores,
          error: null,
        })
      } catch (err: any) {
        console.error(`[benchmark] Erreur cas ${c.id}:`, err)
        caseResults.push({
          id: c.id,
          title: c.jortTitle,
          expected: { isAmending: c.isAmending, code: c.expectedCode, articles: c.expectedArticles, type: c.expectedType, date: c.expectedDate },
          detected: { preFilter: false, isAmending: false, code: null, articles: [], type: null, date: null, confidence: null, method: null },
          outcome: c.isAmending ? 'FN' : 'TN',
          preFilterOutcome: c.isAmending ? 'FN' : 'TN',
          extractionScores: { codeCorrect: null, articlesJaccard: null, typeCorrect: null, dateCorrect: null },
          error: String(err?.message ?? err),
        })
      }
    }

    // ==========================================================================
    // Calcul des métriques
    // ==========================================================================

    const computeMetrics = (results: typeof caseResults, outcomeField: 'outcome' | 'preFilterOutcome') => {
      const tp = results.filter((r) => r[outcomeField] === 'TP').length
      const tn = results.filter((r) => r[outcomeField] === 'TN').length
      const fp = results.filter((r) => r[outcomeField] === 'FP').length
      const fn = results.filter((r) => r[outcomeField] === 'FN').length
      const precision = tp + fp > 0 ? tp / (tp + fp) : null
      const recall = tp + fn > 0 ? tp / (tp + fn) : null
      const f1 = precision !== null && recall !== null && precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : null
      return { tp, tn, fp, fn, precision, recall, f1 }
    }

    const detection = computeMetrics(caseResults, 'outcome')
    const preFilter = computeMetrics(caseResults, 'preFilterOutcome')

    // Extraction scores (sur les TP uniquement)
    const tpCases = caseResults.filter((r) => r.outcome === 'TP')
    const codeAccuracy = tpCases.length > 0
      ? tpCases.filter((r) => r.extractionScores.codeCorrect === true).length / tpCases.filter((r) => r.extractionScores.codeCorrect !== null).length || null
      : null
    const articlesJaccardValues = tpCases.map((r) => r.extractionScores.articlesJaccard).filter((v) => v !== null) as number[]
    const articlesJaccard = articlesJaccardValues.length > 0
      ? articlesJaccardValues.reduce((a, b) => a + b, 0) / articlesJaccardValues.length
      : null
    const typeAccuracy = tpCases.length > 0
      ? tpCases.filter((r) => r.extractionScores.typeCorrect === true).length / tpCases.filter((r) => r.extractionScores.typeCorrect !== null).length || null
      : null
    const dateAccuracyValues = tpCases.filter((r) => r.extractionScores.dateCorrect !== null)
    const dateAccuracy = dateAccuracyValues.length > 0
      ? dateAccuracyValues.filter((r) => r.extractionScores.dateCorrect === true).length / dateAccuracyValues.length
      : null

    // Par code (positifs seulement)
    const byCode: Record<string, { tp: number; fn: number; fp: number; tn: number }> = {}
    for (const r of caseResults) {
      const codeKey = r.expected.code ?? 'unknown'
      if (!byCode[codeKey]) byCode[codeKey] = { tp: 0, fn: 0, fp: 0, tn: 0 }
      byCode[codeKey][r.outcome.toLowerCase() as 'tp' | 'tn' | 'fp' | 'fn']++
    }

    return NextResponse.json({
      meta: {
        totalCases: runnableCases.length,
        skipped: cases.length - runnableCases.length,
        ranAt: new Date().toISOString(),
      },
      detection: {
        ...detection,
        precision: detection.precision !== null ? Math.round(detection.precision * 1000) / 1000 : null,
        recall: detection.recall !== null ? Math.round(detection.recall * 1000) / 1000 : null,
        f1: detection.f1 !== null ? Math.round(detection.f1 * 1000) / 1000 : null,
      },
      preFilter: {
        ...preFilter,
        precision: preFilter.precision !== null ? Math.round(preFilter.precision * 1000) / 1000 : null,
        recall: preFilter.recall !== null ? Math.round(preFilter.recall * 1000) / 1000 : null,
        f1: preFilter.f1 !== null ? Math.round(preFilter.f1 * 1000) / 1000 : null,
      },
      extraction: {
        codeAccuracy: codeAccuracy !== null ? Math.round(codeAccuracy * 1000) / 1000 : null,
        articlesJaccard: articlesJaccard !== null ? Math.round(articlesJaccard * 1000) / 1000 : null,
        typeAccuracy: typeAccuracy !== null ? Math.round(typeAccuracy * 1000) / 1000 : null,
        dateAccuracy: dateAccuracy !== null ? Math.round(dateAccuracy * 1000) / 1000 : null,
      },
      byCode,
      cases: caseResults,
    })
  } catch (error) {
    console.error('[benchmark] Erreur GET:', error)
    return NextResponse.json({ error: 'Erreur benchmark' }, { status: 500 })
  }
}
