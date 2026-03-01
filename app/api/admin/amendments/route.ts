/**
 * API Route: Liste des Amendements JORT
 *
 * GET /api/admin/amendments
 * - Liste tous les amendements détectés, avec filtres
 * - Params: code (COC/CP/...), limit, offset, unextracted_only, has_amendments_only
 *
 * POST /api/admin/amendments/batch-extract
 * - Lance l'extraction batch sur tous les JORT non traités
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min pour le batch

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { getKnowledgeDocument } from '@/lib/ai/knowledge-base-service'
import { extractAmendmentsFromJORT, isLikelyAmendingDocument } from '@/lib/knowledge-base/jort-amendment-extractor'
import { linkAmendmentToKB } from '@/lib/knowledge-base/amendment-linker'
import { TUNISIAN_CODES } from '@/lib/knowledge-base/tunisian-codes-registry'

// =============================================================================
// AUTH
// =============================================================================

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  return ['admin', 'super_admin'].includes(result.rows[0]?.role)
}

// =============================================================================
// GET — Liste des amendements détectés + statistiques
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const codeFilter = searchParams.get('code')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)

    // 1. Statistiques globales
    const statsResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE sm.is_jort_amendment = true)       AS total_amendments,
        COUNT(DISTINCT sm.amended_code_slug) FILTER (WHERE sm.is_jort_amendment = true) AS codes_covered,
        COUNT(*) FILTER (WHERE (
          kb.metadata->>'sourceOrigin' = 'iort_gov_tn'
          OR kb.metadata->>'sourceName' ILIKE '%9anoun%'
          OR kb.title ILIKE '%الرائد الرسمي%'
          OR kb.title ILIKE '%جريدة رسمية%'
        ) AND kb.is_indexed = true) AS total_iort_docs,
        COUNT(*) FILTER (
          WHERE (
            kb.metadata->>'sourceOrigin' = 'iort_gov_tn'
            OR kb.metadata->>'sourceName' ILIKE '%9anoun%'
            OR kb.title ILIKE '%الرائد الرسمي%'
            OR kb.title ILIKE '%جريدة رسمية%'
          )
            AND kb.is_indexed = true
            AND kb.jort_amendments_extracted_at IS NULL
        ) AS pending_extraction
      FROM knowledge_base kb
      LEFT JOIN kb_structured_metadata sm ON sm.knowledge_base_id = kb.id
    `)
    const stats = statsResult.rows[0]

    // 2. Couverture par code
    const coverageResult = await db.query(`
      SELECT
        sm.amended_code_slug     AS code_slug,
        COUNT(DISTINCT sm.knowledge_base_id) AS jort_count,
        COUNT(DISTINCT unnest(sm.amended_articles)) AS article_count
      FROM kb_structured_metadata sm
      WHERE sm.is_jort_amendment = true
        AND sm.amended_code_slug IS NOT NULL
      GROUP BY sm.amended_code_slug
      ORDER BY jort_count DESC
    `)

    // 3. Liste des amendements
    const whereClause = codeFilter
      ? `WHERE sm.is_jort_amendment = true AND sm.amended_code_slug = $1`
      : `WHERE sm.is_jort_amendment = true`

    const queryParams = codeFilter ? [codeFilter, limit, offset] : [limit, offset]
    const paramOffset = codeFilter ? 2 : 1

    const listResult = await db.query(
      `SELECT
         sm.knowledge_base_id     AS jort_kb_id,
         kb.title                 AS jort_title,
         sm.amended_code_slug     AS code_slug,
         sm.amended_articles      AS amended_articles,
         sm.amendment_type        AS amendment_type,
         sm.jort_pub_date         AS jort_date,
         sm.jort_issue_number     AS jort_issue,
         sm.amendment_extracted_at AS extracted_at,
         sm.extraction_confidence  AS confidence,
         (SELECT COUNT(*) FROM kb_legal_relations r
          WHERE r.source_kb_id = sm.knowledge_base_id
            AND r.relation_type = 'amends') AS relations_count
       FROM kb_structured_metadata sm
       JOIN knowledge_base kb ON kb.id = sm.knowledge_base_id
       ${whereClause}
       ORDER BY sm.jort_pub_date DESC NULLS LAST, sm.amendment_extracted_at DESC
       LIMIT $${paramOffset} OFFSET $${paramOffset + 1}`,
      queryParams
    )

    // Enrichir avec les noms des codes
    const codeNames = Object.fromEntries(
      TUNISIAN_CODES.map((c) => [c.slug, { nameAr: c.nameAr, nameFr: c.nameFr }])
    )

    return NextResponse.json({
      stats: {
        totalAmendments: parseInt(stats.total_amendments, 10),
        codesCovered: parseInt(stats.codes_covered, 10),
        totalIortDocs: parseInt(stats.total_iort_docs, 10),
        pendingExtraction: parseInt(stats.pending_extraction, 10),
      },
      coverage: coverageResult.rows.map((row) => ({
        codeSlug: row.code_slug,
        ...codeNames[row.code_slug],
        jortCount: parseInt(row.jort_count, 10),
        articleCount: parseInt(row.article_count, 10),
      })),
      amendments: listResult.rows.map((row) => ({
        jortKbId: row.jort_kb_id,
        jortTitle: row.jort_title,
        codeSlug: row.code_slug,
        codeNameAr: codeNames[row.code_slug]?.nameAr,
        codeNameFr: codeNames[row.code_slug]?.nameFr,
        amendedArticles: row.amended_articles,
        amendmentType: row.amendment_type,
        jortDate: row.jort_date ? String(row.jort_date).slice(0, 10) : null,
        jortIssue: row.jort_issue,
        extractedAt: row.extracted_at,
        confidence: row.confidence ? parseFloat(row.confidence) : null,
        relationsCount: parseInt(row.relations_count, 10),
      })),
      pagination: {
        limit,
        offset,
        total: parseInt(stats.total_amendments, 10),
      },
    })
  } catch (error) {
    console.error('[amendments] Erreur GET:', error)
    return NextResponse.json({ error: 'Erreur récupération amendements' }, { status: 500 })
  }
}

// =============================================================================
// POST — Batch extraction des JORT non traités
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(parseInt(body.batchSize ?? '10', 10), 50)
    const dryRun = body.dryRun === true

    // Récupérer les JORT non traités (sourceOrigin iort_gov_tn OU 9anoun.tn JORT)
    const pendingResult = await db.query(
      `SELECT id, title
       FROM knowledge_base
       WHERE (
         metadata->>'sourceOrigin' = 'iort_gov_tn'
         OR metadata->>'sourceName' ILIKE '%9anoun%'
         OR title ILIKE '%الرائد الرسمي%'
         OR title ILIKE '%جريدة رسمية%'
       )
         AND is_indexed = true
         AND is_active = true
         AND jort_amendments_extracted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $1`,
      [batchSize]
    )

    const pending = pendingResult.rows
    console.log(`[amendments batch] ${pending.length} documents IORT à traiter (batchSize=${batchSize}, dryRun=${dryRun})`)

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        pendingCount: pending.length,
        documents: pending.map((r) => ({ id: r.id, title: r.title })),
      })
    }

    let processed = 0
    let withAmendments = 0
    let errors = 0
    const results: Array<{ id: string; title: string; found: number; success: boolean }> = []

    for (const row of pending) {
      try {
        const kbDoc = await getKnowledgeDocument(row.id)
        if (!kbDoc) continue

        // Test rapide
        if (!isLikelyAmendingDocument(kbDoc.fullText ?? '')) {
          // Marquer comme traité sans amendement
          await db.query(
            `UPDATE knowledge_base SET jort_amendments_extracted_at = NOW() WHERE id = $1`,
            [row.id]
          )
          processed++
          results.push({ id: row.id, title: row.title, found: 0, success: true })
          continue
        }

        const extraction = await extractAmendmentsFromJORT(kbDoc)
        const linking = await linkAmendmentToKB(extraction)

        if (extraction.isAmendingDocument) withAmendments++
        processed++
        results.push({
          id: row.id,
          title: row.title,
          found: extraction.amendments.length,
          success: linking.success || !extraction.isAmendingDocument,
        })
      } catch (err) {
        console.error(`[amendments batch] Erreur doc ${row.id}:`, err)
        errors++
        results.push({ id: row.id, title: row.title, found: 0, success: false })
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      withAmendments,
      errors,
      batchSize,
      results,
    })
  } catch (error) {
    console.error('[amendments] Erreur POST batch:', error)
    return NextResponse.json({ error: 'Erreur batch extraction' }, { status: 500 })
  }
}
