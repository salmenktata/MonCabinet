import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { getErrorMessage } from '@/lib/utils/error-utils'

/**
 * GET /api/admin/monitoring/metrics
 *
 * Récupère les métriques de monitoring en temps réel :
 * - Budget OpenAI
 * - Progression analyse KB
 * - Taux de succès par provider
 * - Stats temporelles
 *
 * Headers:
 * - X-Cron-Secret: Secret pour authentification (optionnel si session admin)
 */
export async function GET(request: NextRequest) {
  try {
    // Auth: X-Cron-Secret ou Bearer token
    const authHeader = request.headers.get('x-cron-secret') || request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    console.log('[Monitoring Metrics] Récupération des métriques...')

    // Configuration budget
    const MONTHLY_BUDGET_USD = 10.0

    // ========================================
    // 1. Stats globales KB
    // ========================================
    const globalStatsResult = await db.query<{
      total_active: number
      total_analyzed: number
      total_not_analyzed: number
      avg_quality_score: number
      total_chunks: number
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE is_active = true) as total_active,
        COUNT(*) FILTER (WHERE is_active = true AND quality_score IS NOT NULL) as total_analyzed,
        COUNT(*) FILTER (WHERE is_active = true AND quality_score IS NULL) as total_not_analyzed,
        ROUND(AVG(quality_score)::numeric, 1) as avg_quality_score,
        (SELECT COUNT(*)
         FROM knowledge_base_chunks kbc
         INNER JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
         WHERE kb.is_active = true) as total_chunks
      FROM knowledge_base
    `)

    const globalStats = globalStatsResult.rows[0]

    // ========================================
    // 2. Répartition par provider (ce mois-ci)
    // ========================================
    const providerStatsResult = await db.query<{
      provider: string
      count: number
      avg_score: number
      success_rate: number
    }>(`
      SELECT
        COALESCE(quality_llm_provider, 'unknown') as provider,
        COUNT(*) as count,
        ROUND(AVG(quality_score)::numeric, 1) as avg_score,
        ROUND(
          (COUNT(*) FILTER (WHERE quality_score > 50)::numeric / NULLIF(COUNT(*), 0) * 100),
          1
        ) as success_rate
      FROM knowledge_base
      WHERE is_active = true
        AND quality_score IS NOT NULL
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY quality_llm_provider
      ORDER BY count DESC
    `)

    const providerStats = providerStatsResult.rows

    // ========================================
    // 3. Calcul budget OpenAI
    // ========================================
    const openaiUsageResult = await db.query<{
      openai_count: number
      openai_short_docs: number
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE quality_llm_provider = 'openai') as openai_count,
        COUNT(*) FILTER (
          WHERE quality_llm_provider = 'openai'
          AND LENGTH(COALESCE(full_text, '')) < 500
        ) as openai_short_docs
      FROM knowledge_base
      WHERE is_active = true
        AND quality_score IS NOT NULL
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
    `)

    const openaiUsage = openaiUsageResult.rows[0]

    // Estimation coût (gpt-4o-mini : $0.150 / 1M input, $0.600 / 1M output)
    const avgInputTokens = 500
    const avgOutputTokens = 200
    const costPerDoc = (avgInputTokens * 0.00015 + avgOutputTokens * 0.0006) / 1000
    const estimatedCostUsd = (openaiUsage.openai_count || 0) * costPerDoc
    const budgetRemaining = MONTHLY_BUDGET_USD - estimatedCostUsd
    const percentUsed = (estimatedCostUsd / MONTHLY_BUDGET_USD) * 100

    // ========================================
    // 4. Progression temporelle (7 derniers jours)
    // ========================================
    const timelineResult = await db.query<{
      date: string
      analyzed: number
      openai: number
      gemini: number
      ollama: number
      avg_score: number
    }>(`
      SELECT
        DATE(quality_assessed_at) as date,
        COUNT(*) as analyzed,
        COUNT(*) FILTER (WHERE quality_llm_provider = 'openai') as openai,
        COUNT(*) FILTER (WHERE quality_llm_provider = 'gemini') as gemini,
        COUNT(*) FILTER (WHERE quality_llm_provider = 'ollama') as ollama,
        ROUND(AVG(quality_score)::numeric, 1) as avg_score
      FROM knowledge_base
      WHERE is_active = true
        AND quality_score IS NOT NULL
        AND quality_assessed_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(quality_assessed_at)
      ORDER BY date ASC
    `)

    const timeline = timelineResult.rows

    // ========================================
    // 5. Distribution des scores
    // ========================================
    const scoreDistributionResult = await db.query<{
      score_range: string
      count: number
    }>(`
      SELECT
        CASE
          WHEN quality_score >= 90 THEN '90-100'
          WHEN quality_score >= 80 THEN '80-89'
          WHEN quality_score >= 70 THEN '70-79'
          WHEN quality_score >= 60 THEN '60-69'
          WHEN quality_score >= 50 THEN '50-59'
          ELSE '0-49'
        END as score_range,
        COUNT(*) as count
      FROM knowledge_base
      WHERE is_active = true
        AND quality_score IS NOT NULL
      GROUP BY score_range
      ORDER BY score_range DESC
    `)

    const scoreDistribution = scoreDistributionResult.rows

    // ========================================
    // 6. Échecs récents (score = 50)
    // ========================================
    const failuresResult = await db.query<{
      total_failures: number
      short_failures: number
      long_failures: number
    }>(`
      SELECT
        COUNT(*) as total_failures,
        COUNT(*) FILTER (WHERE LENGTH(COALESCE(full_text, '')) < 500) as short_failures,
        COUNT(*) FILTER (WHERE LENGTH(COALESCE(full_text, '')) >= 500) as long_failures
      FROM knowledge_base
      WHERE is_active = true
        AND quality_score = 50
    `)

    const failures = failuresResult.rows[0]

    // ========================================
    // Réponse finale
    // ========================================
    const response = {
      timestamp: new Date().toISOString(),
      global: {
        totalActive: globalStats.total_active || 0,
        totalAnalyzed: globalStats.total_analyzed || 0,
        totalNotAnalyzed: globalStats.total_not_analyzed || 0,
        avgQualityScore: parseFloat(String(globalStats.avg_quality_score || 0)),
        totalChunks: globalStats.total_chunks || 0,
        coverage: globalStats.total_active > 0
          ? parseFloat(((globalStats.total_analyzed / globalStats.total_active) * 100).toFixed(1))
          : 0,
      },
      budget: {
        monthlyBudgetUsd: MONTHLY_BUDGET_USD,
        estimatedCostUsd: parseFloat(estimatedCostUsd.toFixed(2)),
        remainingUsd: parseFloat(budgetRemaining.toFixed(2)),
        percentUsed: parseFloat(percentUsed.toFixed(1)),
        openaiDocuments: openaiUsage.openai_count || 0,
        openaiShortDocs: openaiUsage.openai_short_docs || 0,
        note: 'Estimation basée sur gpt-4o-mini pricing',
      },
      providers: providerStats.map(p => ({
        provider: p.provider,
        count: p.count,
        avgScore: parseFloat(String(p.avg_score || 0)),
        successRate: parseFloat(String(p.success_rate || 0)),
      })),
      timeline: timeline.map(t => ({
        date: t.date,
        analyzed: t.analyzed,
        openai: t.openai,
        gemini: t.gemini,
        ollama: t.ollama,
        avgScore: parseFloat(String(t.avg_score || 0)),
      })),
      scoreDistribution: scoreDistribution.map(s => ({
        range: s.score_range,
        count: s.count,
      })),
      failures: {
        total: failures.total_failures || 0,
        shortDocs: failures.short_failures || 0,
        longDocs: failures.long_failures || 0,
      },
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('[Monitoring Metrics] Erreur:', error)
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        error: getErrorMessage(error),
      },
      { status: 500 }
    )
  }
}
