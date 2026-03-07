/**
 * GET /api/admin/analytics/rag-usage
 * Usage RAG : domaines, langues, abstentions, métriques qualité
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const [domainsResult, languagesResult, abstentionsResult, qualityResult, abstentionByDomainResult] =
      await Promise.all([
        // Top 10 domaines
        query(`
          SELECT
            COALESCE(domain, 'non_détecté') AS domain,
            COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE abstention_reason IS NOT NULL)::int AS abstentions
          FROM rag_query_log
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY 1
          ORDER BY count DESC
          LIMIT 10
        `),
        // Répartition langues
        query(`
          SELECT
            COALESCE(question_language, 'inconnu') AS language,
            COUNT(*)::int AS count
          FROM rag_query_log
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY 1
          ORDER BY count DESC
        `),
        // Questions sans réponse (50 dernières)
        query(`
          SELECT
            question,
            abstention_reason,
            COALESCE(avg_similarity, 0)::float AS avg_similarity,
            COALESCE(domain, '') AS domain,
            created_at
          FROM rag_query_log
          WHERE abstention_reason IS NOT NULL
            AND created_at >= NOW() - INTERVAL '30 days'
          ORDER BY created_at DESC
          LIMIT 50
        `),
        // Métriques qualité globales
        query(`
          SELECT
            COALESCE(AVG(avg_similarity), 0)::float AS avg_sim,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_latency,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency,
            COUNT(*) FILTER (WHERE quality_indicator = 'high')::int AS high_count,
            COUNT(*) FILTER (WHERE quality_indicator = 'medium')::int AS medium_count,
            COUNT(*) FILTER (WHERE quality_indicator = 'low')::int AS low_count,
            COUNT(*)::int AS total
          FROM rag_query_log
          WHERE created_at >= NOW() - INTERVAL '30 days'
        `),
        // Taux d'abstention par domaine
        query(`
          SELECT
            COALESCE(domain, 'non_détecté') AS domain,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE abstention_reason IS NOT NULL)::int AS abstentions,
            ROUND(
              COUNT(*) FILTER (WHERE abstention_reason IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0)
            )::int AS abstention_rate
          FROM rag_query_log
          WHERE created_at >= NOW() - INTERVAL '30 days'
            AND domain IS NOT NULL
          GROUP BY 1
          HAVING COUNT(*) >= 5
          ORDER BY abstention_rate DESC
          LIMIT 10
        `),
      ])

    const q = qualityResult.rows[0]

    return NextResponse.json({
      success: true,
      domains: domainsResult.rows,
      languages: languagesResult.rows,
      abstentions: abstentionsResult.rows,
      abstention_by_domain: abstentionByDomainResult.rows,
      quality: {
        avg_similarity: parseFloat(q.avg_sim),
        p50_latency: q.p50_latency ? Math.round(q.p50_latency) : null,
        p95_latency: q.p95_latency ? Math.round(q.p95_latency) : null,
        high_count: q.high_count,
        medium_count: q.medium_count,
        low_count: q.low_count,
        total: q.total,
      },
    })
  } catch (error) {
    console.error('[Analytics RAG Usage] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
