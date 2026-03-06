import { NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

/**
 * GET /api/admin/kb/chunks-health
 *
 * Retourne les métriques de santé des chunks et embeddings de la KB :
 * - Couverture embeddings Ollama (global + par catégorie)
 * - Distribution taille chunks (courts, vides, anomalies)
 * - Documents indexés sans chunks
 * - Métriques qualité (scores, distribution, échecs)
 */
export const GET = withAdminApiAuth(async () => {
  try {
    const [embeddingResult, chunkResult, qualityResult] = await Promise.all([
      // --- Embeddings ---
      db.query(`
        WITH emb AS (
          SELECT
            kb.category,
            COUNT(kbc.id)::int AS total,
            COUNT(kbc.embedding)::int AS with_ollama
          FROM knowledge_base_chunks kbc
          JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
          WHERE kb.is_indexed = true AND kb.is_active = true
          GROUP BY kb.category
        )
        SELECT
          SUM(total)::int AS total_chunks,
          SUM(with_ollama)::int AS ollama_count,
          (SUM(total) - SUM(with_ollama))::int AS missing_embeddings,
          ROUND(SUM(with_ollama) * 100.0 / NULLIF(SUM(total), 0), 1) AS ollama_coverage,
          json_agg(
            json_build_object(
              'category', category,
              'total', total,
              'withEmbedding', with_ollama,
              'coverage', ROUND(with_ollama * 100.0 / NULLIF(total, 0), 1)
            ) ORDER BY total DESC
          ) AS by_category
        FROM emb
      `),

      // --- Chunks ---
      db.query(`
        WITH chunk_stats AS (
          SELECT
            kb.category,
            COUNT(kbc.id)::int AS count,
            ROUND(AVG(LENGTH(kbc.content)))::int AS avg_length,
            COUNT(*) FILTER (WHERE LENGTH(kbc.content) < 100)::int AS short_count,
            COUNT(*) FILTER (WHERE kbc.content IS NULL OR kbc.content = '')::int AS empty_count
          FROM knowledge_base_chunks kbc
          JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
          WHERE kb.is_indexed = true AND kb.is_active = true
          GROUP BY kb.category
        ),
        zero_chunks AS (
          SELECT COUNT(*)::int AS count
          FROM knowledge_base kb
          WHERE kb.is_indexed = true
            AND kb.is_active = true
            AND (kb.chunk_count = 0 OR kb.chunk_count IS NULL)
        )
        SELECT
          SUM(count)::int AS total_chunks,
          ROUND(AVG(avg_length))::int AS avg_chunk_length,
          SUM(short_count)::int AS short_chunks,
          SUM(empty_count)::int AS empty_chunks,
          (SELECT count FROM zero_chunks) AS docs_with_zero_chunks,
          json_agg(
            json_build_object(
              'category', category,
              'count', count,
              'avgLength', avg_length,
              'shortCount', short_count,
              'shortPct', ROUND(short_count * 100.0 / NULLIF(count, 0), 1)
            ) ORDER BY count DESC
          ) AS by_category
        FROM chunk_stats
      `),

      // --- Qualité documents ---
      db.query(`
        WITH dist AS (
          SELECT
            CASE
              WHEN quality_score IS NULL THEN 'Non analysé'
              WHEN quality_score < 60 THEN '< 60 Faible'
              WHEN quality_score < 75 THEN '60-74 Moyen'
              WHEN quality_score < 85 THEN '75-84 Bon'
              ELSE '85-100 Excellent'
            END AS range,
            COUNT(*)::int AS count
          FROM knowledge_base
          WHERE is_active = true
          GROUP BY range
        )
        SELECT
          (SELECT COUNT(*)::int FROM knowledge_base WHERE is_active = true) AS total_docs,
          (SELECT COUNT(*)::int FROM knowledge_base WHERE is_active = true AND quality_score IS NOT NULL) AS with_score,
          (SELECT COUNT(*)::int FROM knowledge_base WHERE is_active = true AND quality_score IS NULL) AS without_score,
          (SELECT ROUND(AVG(quality_score), 1) FROM knowledge_base WHERE is_active = true AND quality_score IS NOT NULL) AS avg_score,
          (SELECT COUNT(*)::int FROM knowledge_base WHERE is_active = true AND quality_score = 50) AS likely_failures,
          json_agg(json_build_object('range', range, 'count', count) ORDER BY range) AS distribution
        FROM dist
      `),
    ])

    const emb = embeddingResult.rows[0]
    const chk = chunkResult.rows[0]
    const qual = qualityResult.rows[0]

    const totalDocs = qual.total_docs ?? 0
    const withScore = qual.with_score ?? 0

    return NextResponse.json({
      success: true,
      embedding: {
        totalChunks: emb.total_chunks ?? 0,
        ollamaCount: emb.ollama_count ?? 0,
        missingEmbeddings: emb.missing_embeddings ?? 0,
        ollamaCoverage: parseFloat(emb.ollama_coverage ?? '0'),
        byCategory: emb.by_category ?? [],
      },
      chunks: {
        totalChunks: chk.total_chunks ?? 0,
        avgChunkLength: chk.avg_chunk_length ?? 0,
        shortChunks: chk.short_chunks ?? 0,
        emptyChunks: chk.empty_chunks ?? 0,
        docsWithZeroChunks: chk.docs_with_zero_chunks ?? 0,
        byCategory: chk.by_category ?? [],
      },
      quality: {
        totalDocs,
        withScore,
        withoutScore: qual.without_score ?? 0,
        avgScore: parseFloat(qual.avg_score ?? '0'),
        coverage: totalDocs > 0 ? Math.round((withScore / totalDocs) * 100) : 0,
        likelyFailures: qual.likely_failures ?? 0,
        distribution: qual.distribution ?? [],
      },
    })
  } catch (error) {
    console.error('[ChunksHealth] Erreur:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
})
