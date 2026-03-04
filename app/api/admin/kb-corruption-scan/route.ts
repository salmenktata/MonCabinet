import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { verifyCronSecret } from '@/lib/auth/cron-secret'
import { db } from '@/lib/db/postgres'
import { detectOcrCorruption } from '@/lib/kb/corruption-detector'

/**
 * GET /api/admin/kb-corruption-scan
 *
 * Scanne la KB à la recherche de documents OCR arabes corrompus.
 *
 * Query params :
 *   threshold  float  (défaut: 0.6)   — seuil de score corruption
 *   dryRun     bool   (défaut: true)   — lister sans supprimer
 *   limit      int    (défaut: 500)    — nb de docs à scanner
 *   offset     int    (défaut: 0)
 *
 * Accessible aussi via CRON_SECRET pour automatisation.
 */
export const GET = async (req: NextRequest) => {
  const isCron = verifyCronSecret(req)
  if (!isCron) {
    return withAdminApiAuth(async (_req, _ctx, _session) => {
      return handleScan(req)
    })(req, {} as never)
  }
  return handleScan(req)
}

async function handleScan(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url)
    const threshold = parseFloat(searchParams.get('threshold') || '0.6')
    const dryRun = searchParams.get('dryRun') !== 'false'
    const limit = parseInt(searchParams.get('limit') || '500', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Récupérer les docs indexés avec leur contenu (full_text)
    const docsResult = await db.query(
      `SELECT id, title, doc_type, chunk_count, full_text,
              metadata->>'sourceOrigin' as source_origin,
              metadata->>'quality_flag' as quality_flag
       FROM knowledge_base
       WHERE is_indexed = true
         AND full_text IS NOT NULL
         AND LENGTH(full_text) > 100
         AND (metadata->>'quality_flag' IS NULL OR metadata->>'quality_flag' != 'corrupted_ocr')
       ORDER BY chunk_count DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )

    const corrupted: Array<{
      id: string
      title: string
      docType: string
      chunkCount: number
      sourceOrigin: string | null
      corruptionScore: number
      reasons: string[]
    }> = []

    for (const row of docsResult.rows) {
      const result = detectOcrCorruption(row.full_text || '')
      if (result.score >= threshold) {
        corrupted.push({
          id: row.id,
          title: row.title || '(sans titre)',
          docType: row.doc_type,
          chunkCount: parseInt(row.chunk_count || '0'),
          sourceOrigin: row.source_origin,
          corruptionScore: result.score,
          reasons: result.reasons,
        })
      }
    }

    let deleted = 0
    if (!dryRun && corrupted.length > 0) {
      const ids = corrupted.map(d => d.id)
      await db.query(
        `DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = ANY($1::uuid[])`,
        [ids]
      )
      const deleteResult = await db.query(
        `DELETE FROM knowledge_base WHERE id = ANY($1::uuid[]) RETURNING id`,
        [ids]
      )
      deleted = deleteResult.rowCount || 0
    } else if (dryRun && corrupted.length > 0) {
      // En mode dryRun, marquer les docs flaggés dans metadata
      const ids = corrupted.map(d => d.id)
      await db.query(
        `UPDATE knowledge_base
         SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'quality_flag', 'corrupted_ocr',
           'corruption_score', (metadata->>'corruption_score')::text
         )
         WHERE id = ANY($1::uuid[])`,
        [ids]
      )
    }

    const totalScanned = docsResult.rows.length
    const chunksToDelete = corrupted.reduce((sum, d) => sum + d.chunkCount, 0)

    return NextResponse.json({
      success: true,
      scanned: totalScanned,
      corruptedFound: corrupted.length,
      chunksAffected: chunksToDelete,
      deleted,
      dryRun,
      threshold,
      documents: corrupted,
    })
  } catch (error) {
    console.error('[KB Corruption Scan] Erreur:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    )
  }
}
