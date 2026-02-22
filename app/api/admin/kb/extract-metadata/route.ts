/**
 * POST /api/admin/kb/extract-metadata
 *
 * Extraction batch des métadonnées juridiques structurées pour les docs
 * de jurisprudence (cassation.tn) sans métadonnées.
 *
 * Body params:
 * - batchSize     (default: 10)    Nombre de docs à traiter par appel
 * - category      (default: 'jurisprudence') Catégorie cible
 * - sourceUrl     (optional)       Filtrer par source (ex: 'cassation.tn')
 * - forceReextract (default: false) Re-extraire même si métadonnées existantes
 *
 * GET /api/admin/kb/extract-metadata
 *
 * Stats : couverture métadonnées par catégorie/source
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { extractStructuredMetadataV2 } from '@/lib/knowledge-base/structured-metadata-extractor-service'
import { db } from '@/lib/db/postgres'
import { getErrorMessage } from '@/lib/utils/error-utils'

export const maxDuration = 300

export const POST = withAdminApiAuth(async (request: NextRequest, _ctx, _session) => {
  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(parseInt(body.batchSize || '10', 10), 50)
    const category = body.category || 'jurisprudence'
    const sourceUrl = body.sourceUrl || null
    const forceReextract = body.forceReextract === true

    console.log('[Extract Metadata Batch] Démarrage:', { batchSize, category, sourceUrl, forceReextract })

    // Sélectionner les docs sans métadonnées structurées (ou forcer tous)
    const sourceFilter = sourceUrl
      ? `AND ws.base_url ILIKE $3`
      : ''
    const params: (string | number)[] = [category, batchSize]
    if (sourceUrl) params.push(`%${sourceUrl}%`)

    const query = `
      SELECT DISTINCT kb.id, kb.title, kb.category, ws.base_url AS source_url
      FROM knowledge_base kb
      LEFT JOIN kb_structured_metadata meta ON meta.knowledge_base_id = kb.id
      LEFT JOIN web_pages wp ON wp.knowledge_base_id = kb.id
      LEFT JOIN web_sources ws ON ws.id = wp.web_source_id
      WHERE kb.category = $1
        AND kb.is_indexed = true
        AND kb.full_text IS NOT NULL
        ${forceReextract ? '' : 'AND meta.knowledge_base_id IS NULL'}
        ${sourceFilter}
      ORDER BY kb.id
      LIMIT $2
    `

    const docsResult = await db.query<{ id: string; title: string; category: string; source_url: string }>(
      query,
      params
    )

    const docs = docsResult.rows

    if (docs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun document à traiter',
        processed: 0,
        succeeded: 0,
        failed: 0,
        results: [],
      })
    }

    console.log(`[Extract Metadata Batch] ${docs.length} docs à traiter`)

    const results: Array<{
      id: string
      title: string
      success: boolean
      confidence?: number
      method?: string
      error?: string
    }> = []

    for (const doc of docs) {
      try {
        const result = await extractStructuredMetadataV2(doc.id, {
          forceReextract,
          useRegexOnly: false,
          useLLMOnly: false,
        })

        results.push({
          id: doc.id,
          title: doc.title,
          success: result.success,
          confidence: result.metadata?.extractionConfidence,
          method: result.metadata?.extractionMethod,
          error: result.errors.length > 0 ? result.errors[0] : undefined,
        })

        console.log(
          `[Extract Metadata Batch] ${doc.id} — ${result.success ? '✓' : '✗'} ` +
          `confidence=${result.metadata?.extractionConfidence?.toFixed(2)} ` +
          `method=${result.metadata?.extractionMethod}`
        )
      } catch (err) {
        results.push({
          id: doc.id,
          title: doc.title,
          success: false,
          error: getErrorMessage(err),
        })
        console.error(`[Extract Metadata Batch] Erreur doc ${doc.id}:`, err)
      }
    }

    const succeeded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({
      success: true,
      processed: results.length,
      succeeded,
      failed,
      results,
    })
  } catch (error) {
    console.error('[Extract Metadata Batch] Erreur fatale:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })

export const GET = withAdminApiAuth(async (request: NextRequest, _ctx, _session) => {
  try {
    // Stats couverture métadonnées par catégorie
    const statsResult = await db.query<{
      category: string
      total_docs: string
      with_metadata: string
      coverage_pct: string
      avg_confidence: string
    }>(
      `SELECT
        kb.category,
        COUNT(DISTINCT kb.id)::text AS total_docs,
        COUNT(DISTINCT meta.knowledge_base_id)::text AS with_metadata,
        ROUND(
          100.0 * COUNT(DISTINCT meta.knowledge_base_id) / NULLIF(COUNT(DISTINCT kb.id), 0), 1
        )::text AS coverage_pct,
        ROUND(AVG(meta.extraction_confidence)::numeric, 3)::text AS avg_confidence
      FROM knowledge_base kb
      LEFT JOIN kb_structured_metadata meta ON meta.knowledge_base_id = kb.id
      WHERE kb.is_indexed = true
      GROUP BY kb.category
      ORDER BY total_docs DESC`
    )

    // Stats par source pour jurisprudence
    const sourceStatsResult = await db.query<{
      source_url: string
      total_docs: string
      with_metadata: string
      coverage_pct: string
    }>(
      `SELECT
        ws.base_url AS source_url,
        COUNT(DISTINCT kb.id)::text AS total_docs,
        COUNT(DISTINCT meta.knowledge_base_id)::text AS with_metadata,
        ROUND(
          100.0 * COUNT(DISTINCT meta.knowledge_base_id) / NULLIF(COUNT(DISTINCT kb.id), 0), 1
        )::text AS coverage_pct
      FROM knowledge_base kb
      JOIN web_pages wp ON wp.knowledge_base_id = kb.id
      JOIN web_sources ws ON ws.id = wp.web_source_id
      LEFT JOIN kb_structured_metadata meta ON meta.knowledge_base_id = kb.id
      WHERE kb.is_indexed = true AND kb.category = 'jurisprudence'
      GROUP BY ws.base_url
      ORDER BY total_docs DESC`
    )

    return NextResponse.json({
      success: true,
      byCategory: statsResult.rows.map(r => ({
        category: r.category,
        totalDocs: parseInt(r.total_docs),
        withMetadata: parseInt(r.with_metadata),
        coveragePct: parseFloat(r.coverage_pct || '0'),
        avgConfidence: parseFloat(r.avg_confidence || '0'),
      })),
      jurisprudenceBySource: sourceStatsResult.rows.map(r => ({
        sourceUrl: r.source_url,
        totalDocs: parseInt(r.total_docs),
        withMetadata: parseInt(r.with_metadata),
        coveragePct: parseFloat(r.coverage_pct || '0'),
      })),
    })
  } catch (error) {
    console.error('[Extract Metadata Batch GET] Erreur:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
