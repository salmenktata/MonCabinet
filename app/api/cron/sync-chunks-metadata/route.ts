import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { syncMetadataToRAG } from '@/lib/web-scraper/metadata-extractor-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

/**
 * POST /api/cron/sync-chunks-metadata
 *
 * Backfill : propage les métadonnées structurées de web_page_structured_metadata
 * vers knowledge_base_chunks.metadata et kb_structured_metadata.
 *
 * À lancer une fois pour les ~9 775 pages déjà organisées, puis automatiquement
 * géré par metadata-extractor-service.ts pour les nouvelles pages.
 *
 * Body:
 * {
 *   batchSize?: number,   // Pages par batch (défaut: 50)
 *   sourceId?: string,    // Filtrer par web_source_id (optionnel)
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Vérifier CRON_SECRET
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({})) as { batchSize?: number; sourceId?: string }
    const batchSize = Math.min(body.batchSize ?? 50, 200)
    const sourceId = body.sourceId

    // Sélectionner les pages avec métadonnées extraites mais non encore sync vers KB
    const queryParams: (string | number)[] = [batchSize]
    let sourceFilter = ''
    if (sourceId) {
      queryParams.push(sourceId)
      sourceFilter = `AND wp.web_source_id = $${queryParams.length}`
    }

    const pagesResult = await db.query<{
      web_page_id: string
      knowledge_base_id: string
      tribunal: string | null
      chambre: string | null
      decision_date: string | null
      decision_number: string | null
      keywords: unknown
      abstract: string | null
      extraction_confidence: number | null
      llm_provider: string | null
      llm_model: string | null
      extraction_method: string | null
    }>(
      `SELECT
         wpsm.web_page_id,
         wp.knowledge_base_id,
         wpsm.tribunal,
         wpsm.chambre,
         wpsm.decision_date::text,
         wpsm.decision_number,
         wpsm.keywords,
         wpsm.abstract,
         wpsm.extraction_confidence,
         wpsm.llm_provider,
         wpsm.llm_model,
         NULL::text AS extraction_method
       FROM web_page_structured_metadata wpsm
       JOIN web_pages wp ON wpsm.web_page_id = wp.id
       WHERE wp.knowledge_base_id IS NOT NULL
         ${sourceFilter}
         AND NOT EXISTS (
           SELECT 1 FROM kb_structured_metadata kbm
           WHERE kbm.knowledge_base_id = wp.knowledge_base_id
         )
       ORDER BY wpsm.extracted_at DESC
       LIMIT $1`,
      queryParams
    )

    if (pagesResult.rows.length === 0) {
      // Compter combien ont déjà été sync
      const countResult = await db.query<{ synced: string; total: string }>(
        `SELECT
           COUNT(DISTINCT kbm.knowledge_base_id) AS synced,
           COUNT(DISTINCT wp.knowledge_base_id) AS total
         FROM web_pages wp
         JOIN web_page_structured_metadata wpsm ON wpsm.web_page_id = wp.id
         LEFT JOIN kb_structured_metadata kbm ON kbm.knowledge_base_id = wp.knowledge_base_id
         WHERE wp.knowledge_base_id IS NOT NULL`
      )
      const stats = countResult.rows[0]
      return NextResponse.json({
        success: true,
        message: 'Toutes les pages sont déjà synchronisées',
        processed: 0,
        hasMore: false,
        stats: {
          synced: parseInt(stats.synced, 10),
          total: parseInt(stats.total, 10),
        },
      })
    }

    const succeeded: string[] = []
    const failed: Array<{ pageId: string; error: string }> = []

    for (const row of pagesResult.rows) {
      try {
        // Reconstruire un LLMMetadataResponse minimal à partir des données stockées
        const metadata = {
          document_type: null,
          document_date: null,
          document_number: null,
          title_official: null,
          language: null,
          tribunal: row.tribunal,
          chambre: row.chambre,
          decision_number: row.decision_number,
          decision_date: row.decision_date,
          parties: null,
          text_type: null,
          text_number: null,
          publication_date: null,
          effective_date: null,
          jort_reference: null,
          author: null,
          publication_name: null,
          keywords: Array.isArray(row.keywords)
            ? (row.keywords as string[])
            : typeof row.keywords === 'string'
              ? JSON.parse(row.keywords)
              : null,
          abstract: row.abstract,
          extraction_confidence: row.extraction_confidence ?? 0.5,
          extraction_method: row.extraction_method ?? 'hybrid',
        }

        await syncMetadataToRAG(
          row.web_page_id,
          metadata,
          row.llm_provider ?? 'none',
          row.llm_model ?? 'none'
        )
        succeeded.push(row.web_page_id)
      } catch (err) {
        failed.push({
          pageId: row.web_page_id,
          error: err instanceof Error ? err.message : 'Erreur inconnue',
        })
      }
    }

    // Compter le reste à traiter
    const remainingResult = await db.query<{ remaining: string }>(
      `SELECT COUNT(*) AS remaining
       FROM web_pages wp
       JOIN web_page_structured_metadata wpsm ON wpsm.web_page_id = wp.id
       WHERE wp.knowledge_base_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM kb_structured_metadata kbm
           WHERE kbm.knowledge_base_id = wp.knowledge_base_id
         )`
    )
    const remaining = parseInt(remainingResult.rows[0].remaining, 10)

    console.log(`[SyncChunksMetadata] Batch: ${succeeded.length} OK | ${failed.length} erreurs | Restantes: ${remaining}`)

    return NextResponse.json({
      success: true,
      processed: succeeded.length,
      failed: failed.length,
      errors: failed.slice(0, 5),
      hasMore: remaining > 0,
      remaining,
    })
  } catch (error) {
    console.error('[SyncChunksMetadata] Erreur fatale:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
