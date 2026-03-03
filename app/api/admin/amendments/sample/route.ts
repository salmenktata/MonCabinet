/**
 * API Route: Sampling aléatoire de documents JORT pour benchmarking
 *
 * POST /api/admin/amendments/sample
 * Body: { count?: number, excludeAlreadyGold?: boolean }
 * - Récupère N docs JORT aléatoires de la KB
 * - Lance la détection automatique (isLikelyAmendingDocument + extractAmendmentsFromJORT)
 * - Retourne les résultats pour review manuelle
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
import type { ArticleAmendment } from '@/lib/knowledge-base/jort-amendment-extractor'
import goldDataset from '@/data/gold-amendments-dataset.json'

// =============================================================================
// AUTH
// =============================================================================

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  return ['admin', 'super_admin'].includes(result.rows[0]?.role)
}

// =============================================================================
// POST — Sample + détection automatique
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization')
    if (!verifyCronSecret(authHeader)) {
      const session = await getSession()
      if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

      const isAdmin = await checkAdminAccess(session.user.id)
      if (!isAdmin) return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const count = Math.min(parseInt(body.count ?? '30', 10), 100)
    const excludeAlreadyGold = body.excludeAlreadyGold !== false

    // IDs déjà dans le gold dataset
    const goldIds = excludeAlreadyGold
      ? (goldDataset as any).cases
          .map((c: any) => c.jortKbId)
          .filter(Boolean)
      : []

    const excludeClause = goldIds.length > 0
      ? `AND id != ALL($2::uuid[])`
      : ''

    const queryParams: any[] = [count]
    if (goldIds.length > 0) queryParams.push(goldIds)

    // Récupérer des docs JORT aléatoires
    const sampledResult = await db.query(
      `SELECT id, title
       FROM knowledge_base
       WHERE (
         metadata->>'sourceOrigin' = 'iort_gov_tn'
         OR metadata->>'sourceName' ILIKE '%9anoun%'
         OR title ILIKE '%الرائد الرسمي%'
         OR title ILIKE '%جريدة رسمية%'
         OR title ~* 'Ja[0-9]{3}[0-9]{4}'
       )
         AND is_indexed = true
         AND is_active = true
         ${excludeClause}
       ORDER BY RANDOM()
       LIMIT $1`,
      queryParams
    )

    const sampled = sampledResult.rows
    console.log(`[sample] ${sampled.length} docs sélectionnés (count=${count}, excludeGold=${excludeAlreadyGold})`)

    // Lancer la détection sur chaque doc
    const results: Array<{
      id: string
      title: string
      preFilterResult: boolean
      detectedAmending: boolean
      detectedCode: string | null
      detectedArticles: number[]
      detectedType: string | null
      detectedDate: string | null
      confidence: number | null
      extractionMethod: string | null
      amendments: ArticleAmendment[]
      error: string | null
    }> = []

    for (const row of sampled) {
      try {
        const kbDoc = await getKnowledgeDocument(row.id)
        if (!kbDoc) {
          results.push({
            id: row.id,
            title: row.title,
            preFilterResult: false,
            detectedAmending: false,
            detectedCode: null,
            detectedArticles: [],
            detectedType: null,
            detectedDate: null,
            confidence: null,
            extractionMethod: null,
            amendments: [],
            error: 'Document introuvable dans la KB',
          })
          continue
        }

        const preFilter = isLikelyAmendingDocument(kbDoc.fullText ?? '', kbDoc.title)

        if (!preFilter) {
          results.push({
            id: row.id,
            title: row.title,
            preFilterResult: false,
            detectedAmending: false,
            detectedCode: null,
            detectedArticles: [],
            detectedType: null,
            detectedDate: null,
            confidence: null,
            extractionMethod: null,
            amendments: [],
            error: null,
          })
          continue
        }

        const extraction = await extractAmendmentsFromJORT(kbDoc)

        const primaryAmendment = extraction.amendments[0] ?? null
        results.push({
          id: row.id,
          title: row.title,
          preFilterResult: true,
          detectedAmending: extraction.isAmendingDocument,
          detectedCode: primaryAmendment?.targetCodeSlug ?? null,
          detectedArticles: primaryAmendment?.affectedArticles ?? [],
          detectedType: primaryAmendment?.amendmentType ?? null,
          detectedDate: extraction.jortDate || null,
          confidence: extraction.confidence,
          extractionMethod: extraction.extractionMethod,
          amendments: extraction.amendments,
          error: null,
        })
      } catch (err: any) {
        console.error(`[sample] Erreur doc ${row.id}:`, err)
        results.push({
          id: row.id,
          title: row.title,
          preFilterResult: false,
          detectedAmending: false,
          detectedCode: null,
          detectedArticles: [],
          detectedType: null,
          detectedDate: null,
          confidence: null,
          extractionMethod: null,
          amendments: [],
          error: String(err?.message ?? err),
        })
      }
    }

    const detectedPositives = results.filter((r) => r.detectedAmending).length
    const preFilterPositives = results.filter((r) => r.preFilterResult).length

    return NextResponse.json({
      count: results.length,
      detectedPositives,
      preFilterPositives,
      results,
    })
  } catch (error) {
    console.error('[sample] Erreur POST:', error)
    return NextResponse.json({ error: 'Erreur sampling' }, { status: 500 })
  }
}
