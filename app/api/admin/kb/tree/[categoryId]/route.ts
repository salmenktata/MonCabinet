import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { safeParseInt } from '@/lib/utils/safe-number'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

/**
 * GET /api/admin/kb/tree/:categoryId
 *
 * Retourne les documents d'une catégorie donnée (lazy loading)
 * Le categoryId est au format "category" ou "category:subcategory"
 */
export const GET = withAdminApiAuth(async (request, ctx, _session) => {
  try {
    const { categoryId } = await ctx.params!
    const decoded = decodeURIComponent(categoryId)

    // Parse category:subcategory
    const parts = decoded.split(':')
    const category = parts[0]
    const subcategory = parts.length > 1 ? parts[1] : null

    const queryParams: (string | null)[] = [category]
    let subcategoryClause = ''

    if (subcategory && subcategory !== '_null') {
      subcategoryClause = 'AND kb.subcategory = $2'
      queryParams.push(subcategory)
    } else if (subcategory === '_null') {
      subcategoryClause = 'AND kb.subcategory IS NULL'
    }

    const result = await db.query(
      `SELECT
        kb.id, kb.title, kb.category, kb.subcategory,
        kb.is_indexed, kb.quality_score, kb.updated_at, kb.version,
        (SELECT COUNT(*) FROM knowledge_base_chunks WHERE knowledge_base_id = kb.id) as chunk_count,
        wp.url as source_url,
        wp.last_crawled_at,
        CASE WHEN wp.last_crawled_at > kb.updated_at THEN true ELSE false END as is_stale
      FROM knowledge_base kb
      LEFT JOIN web_pages wp ON wp.knowledge_base_id = kb.id
      WHERE kb.is_active = true AND kb.language = 'ar' AND kb.category = $1
        ${subcategoryClause}
      ORDER BY kb.title ASC
      LIMIT 100`,
      queryParams
    )

    return NextResponse.json({
      documents: result.rows.map(row => ({
        id: row.id,
        title: row.title,
        category: row.category,
        subcategory: row.subcategory,
        isIndexed: row.is_indexed,
        qualityScore: row.quality_score ? parseFloat(row.quality_score) : null,
        updatedAt: row.updated_at,
        version: row.version,
        chunkCount: parseInt(row.chunk_count, 10) || 0,
        sourceUrl: row.source_url,
        lastCrawledAt: row.last_crawled_at,
        isStale: row.is_stale,
      })),
    })
  } catch (error) {
    console.error('[KB Tree Category API] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des documents' },
      { status: 500 }
    )
  }
})
