/**
 * GET /api/admin/monitoring/deepseek-stats
 * Retourne les stats d'usage DeepSeek (appels + tokens + coût estimé) des 7 derniers jours.
 * Protégé par session super-admin.
 */
import { NextResponse } from 'next/server'
import { getDeepSeekDailyStats } from '@/lib/ai/deepseek-usage-tracker'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const GET = withAdminApiAuth(async (_request, _ctx, _session) => {
  const stats = await getDeepSeekDailyStats(7)

  // Calcul des totaux sur 7j
  let totalCalls = 0
  let totalTokensIn = 0
  let totalTokensOut = 0
  let totalCostUsd = 0

  for (const day of stats) {
    totalCalls += day.totalCalls
    for (const data of Object.values(day.byModel)) {
      totalTokensIn += data.tokensIn
      totalTokensOut += data.tokensOut
      totalCostUsd += data.estimatedCostUsd
    }
  }

  return NextResponse.json({
    status: 'ok',
    stats,
    totals: {
      totalCalls,
      totalTokensIn,
      totalTokensOut,
      estimatedCostUsd: totalCostUsd,
    },
    thresholds: {
      dailyCostAlertUsd: 5.0,
      pricePerMTokenInCache: 0.028,
      pricePerMTokenOut: 0.42,
    },
  })
})
