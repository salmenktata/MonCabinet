/**
 * GET /api/admin/monitoring/pipeline-comparison
 *
 * Retourne une comparaison des métriques entre les deux pipelines RAG :
 * - "chat" : /api/chat (rag-chat-service.ts — dual embed, Legal Router, reranking)
 * - "kb_search" : /api/client/kb/search (unified-rag-service.ts — hybrid search)
 *
 * Métriques comparées sur les N derniers jours (défaut: 7) :
 * - Taux d'abstention
 * - Taux de cache hit
 * - Nombre moyen de sources retournées
 * - Similarité moyenne
 * - Latence moyenne
 * - Taux de quality gate déclenché
 * - Taux de routeur échoué
 *
 * Réponse : { chat: PipelineDaySummary[], kbSearch: PipelineDaySummary[], comparison: {...} }
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { getPipelineMetrics, type PipelineDaySummary } from '@/lib/metrics/rag-metrics'

export const dynamic = 'force-dynamic'

// Métriques de type "taux" : valeur 0 est significative (ex: 0 abstentions = bonne santé)
// → filtrer par totalRequests > 0 (pas par la valeur du champ)
const RATE_METRICS = new Set(['abstentionRate', 'cacheHitRate', 'qualityGateRate', 'routerFailedRate'])

function avgMetric(summaries: PipelineDaySummary[], key: keyof PipelineDaySummary): number | null {
  if (summaries.length === 0) return null
  const withData = RATE_METRICS.has(key as string)
    ? summaries.filter(s => s.totalRequests > 0)
    : summaries.filter(s => (s[key] as number) > 0)
  if (withData.length === 0) return null
  return withData.reduce((sum, s) => sum + (s[key] as number), 0) / withData.length
}

export const GET = withAdminApiAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const days = Math.min(parseInt(searchParams.get('days') || '7', 10), 30)

  const [chatMetrics, kbSearchMetrics] = await Promise.all([
    getPipelineMetrics('chat', days),
    getPipelineMetrics('kb_search', days),
  ])

  // Calcul des moyennes sur la période
  const chatAvg = {
    abstentionRate: avgMetric(chatMetrics, 'abstentionRate'),
    cacheHitRate: avgMetric(chatMetrics, 'cacheHitRate'),
    avgSourcesCount: avgMetric(chatMetrics, 'avgSourcesCount'),
    avgSimilarity: avgMetric(chatMetrics, 'avgSimilarity'),
    avgLatencyMs: avgMetric(chatMetrics, 'avgLatencyMs'),
    qualityGateRate: avgMetric(chatMetrics, 'qualityGateRate'),
    routerFailedRate: avgMetric(chatMetrics, 'routerFailedRate'),
    totalRequests: chatMetrics.reduce((s, m) => s + m.totalRequests, 0),
  }

  const kbSearchAvg = {
    abstentionRate: avgMetric(kbSearchMetrics, 'abstentionRate'),
    cacheHitRate: avgMetric(kbSearchMetrics, 'cacheHitRate'),
    avgSourcesCount: avgMetric(kbSearchMetrics, 'avgSourcesCount'),
    avgSimilarity: avgMetric(kbSearchMetrics, 'avgSimilarity'),
    avgLatencyMs: avgMetric(kbSearchMetrics, 'avgLatencyMs'),
    qualityGateRate: avgMetric(kbSearchMetrics, 'qualityGateRate'),
    routerFailedRate: avgMetric(kbSearchMetrics, 'routerFailedRate'),
    totalRequests: kbSearchMetrics.reduce((s, m) => s + m.totalRequests, 0),
  }

  // Delta relatif (kb_search vs chat) — positif = kb_search > chat
  // Retourne null si l'un des pipelines n'a pas de données (évite les faux -100%)
  const delta = (a: number | null, b: number | null) =>
    (a == null || b == null || a === 0) ? null : ((b - a) / a)

  const comparison = {
    abstentionRateDelta: delta(chatAvg.abstentionRate, kbSearchAvg.abstentionRate),
    avgSimilarityDelta: delta(chatAvg.avgSimilarity, kbSearchAvg.avgSimilarity),
    avgSourcesDelta: delta(chatAvg.avgSourcesCount, kbSearchAvg.avgSourcesCount),
    avgLatencyDelta: delta(chatAvg.avgLatencyMs, kbSearchAvg.avgLatencyMs),
    // Alertes : divergences > 20% (seulement si les deux pipelines ont des données)
    alerts: [] as string[],
  }

  // Alertes seulement si les deux pipelines ont suffisamment de données (évite faux positifs)
  const MIN_REQUESTS_FOR_ALERT = 10
  const canCompare = chatAvg.totalRequests >= MIN_REQUESTS_FOR_ALERT && kbSearchAvg.totalRequests >= MIN_REQUESTS_FOR_ALERT

  if (canCompare && comparison.abstentionRateDelta !== null && Math.abs(comparison.abstentionRateDelta) > 0.2) {
    comparison.alerts.push(`Taux d'abstention : delta ${(comparison.abstentionRateDelta * 100).toFixed(0)}% entre chat et kb_search`)
  }
  if (canCompare && comparison.avgSimilarityDelta !== null && Math.abs(comparison.avgSimilarityDelta) > 0.2) {
    comparison.alerts.push(`Similarité moyenne : delta ${(comparison.avgSimilarityDelta * 100).toFixed(0)}% entre chat et kb_search`)
  }

  return NextResponse.json({
    success: true,
    period: { days },
    chat: { daily: chatMetrics, avg: chatAvg },
    kbSearch: { daily: kbSearchMetrics, avg: kbSearchAvg },
    comparison,
    generatedAt: new Date().toISOString(),
  })
})
