import { NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { safeParseInt } from '@/lib/utils/safe-number'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

/**
 * GET /api/admin/kb/tree
 *
 * Retourne les stats KB groupées par catégorie/sous-catégorie
 * pour la vue arborescente
 */
export const GET = withAdminApiAuth(async (_request, _ctx, _session) => {
  try {
    const result = await db.query(`
      SELECT
        kb.category,
        kb.subcategory,
        COUNT(*) as doc_count,
        COUNT(*) FILTER (WHERE kb.is_indexed = true) as indexed_count,
        AVG(kb.quality_score) FILTER (WHERE kb.quality_score IS NOT NULL) as avg_quality,
        COUNT(*) FILTER (WHERE kb.updated_at < NOW() - INTERVAL '30 days') as stale_count,
        MAX(kb.updated_at) as last_updated
      FROM knowledge_base kb
      WHERE kb.is_active = true AND kb.language = 'ar'
      GROUP BY kb.category, kb.subcategory
      ORDER BY kb.category, kb.subcategory
    `)

    // Grouper par catégorie
    const tree: Record<string, {
      category: string
      doc_count: number
      indexed_count: number
      avg_quality: number | null
      stale_count: number
      last_updated: string | null
      subcategories: Array<{
        subcategory: string | null
        doc_count: number
        indexed_count: number
        avg_quality: number | null
        stale_count: number
        last_updated: string | null
      }>
    }> = {}

    for (const row of result.rows) {
      const cat = row.category || 'autre'
      if (!tree[cat]) {
        tree[cat] = {
          category: cat,
          doc_count: 0,
          indexed_count: 0,
          avg_quality: null,
          stale_count: 0,
          last_updated: null,
          subcategories: [],
        }
      }

      tree[cat].doc_count += parseInt(row.doc_count, 10) || 0
      tree[cat].indexed_count += parseInt(row.indexed_count, 10) || 0
      tree[cat].stale_count += parseInt(row.stale_count, 10) || 0

      if (row.last_updated) {
        if (!tree[cat].last_updated || row.last_updated > tree[cat].last_updated) {
          tree[cat].last_updated = row.last_updated
        }
      }

      // Calculer la moyenne pondérée de qualité
      if (row.avg_quality != null) {
        const count = parseInt(row.doc_count, 10) || 1
        if (tree[cat].avg_quality == null) {
          tree[cat].avg_quality = parseFloat(row.avg_quality)
        } else {
          const prevTotal = tree[cat].doc_count - count
          tree[cat].avg_quality = (tree[cat].avg_quality! * prevTotal + parseFloat(row.avg_quality) * count) / tree[cat].doc_count
        }
      }

      tree[cat].subcategories.push({
        subcategory: row.subcategory,
        doc_count: parseInt(row.doc_count, 10) || 0,
        indexed_count: parseInt(row.indexed_count, 10) || 0,
        avg_quality: row.avg_quality ? parseFloat(row.avg_quality) : null,
        stale_count: parseInt(row.stale_count, 10) || 0,
        last_updated: row.last_updated,
      })
    }

    return NextResponse.json({
      categories: Object.values(tree).sort((a, b) => b.doc_count - a.doc_count),
    })
  } catch (error) {
    console.error('[KB Tree API] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de l\'arbre KB' },
      { status: 500 }
    )
  }
})
