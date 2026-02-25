/**
 * GET /api/admin/monitoring/groq-stats
 * Retourne les stats d'usage Groq (appels + tokens) des 7 derniers jours.
 * Protégé par session super-admin ou CRON_SECRET.
 */
import { NextResponse } from 'next/server'
import { getGroqDailyStats } from '@/lib/ai/groq-usage-tracker'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const GET = withAdminApiAuth(async (_request, _ctx, _session) => {
  const stats = await getGroqDailyStats(7)

  // Calcul des totaux sur 7j
  let totalCalls = 0
  let total70bCalls = 0
  let total8bCalls = 0
  let totalTokensIn = 0
  let totalTokensOut = 0
  let totalCostUsd = 0

  for (const day of stats) {
    totalCalls += day.totalCalls
    for (const [model, data] of Object.entries(day.byModel)) {
      totalTokensIn += data.tokensIn
      totalTokensOut += data.tokensOut
      totalCostUsd += data.estimatedCostUsd
      if (model.includes('70b')) total70bCalls += data.calls
      if (model.includes('8b') || model.includes('instant')) total8bCalls += data.calls
    }
  }

  return NextResponse.json({
    status: 'ok',
    stats,
    totals: {
      totalCalls,
      total70bCalls,
      total8bCalls,
      totalTokensIn,
      totalTokensOut,
      estimatedCostUsd: totalCostUsd,
    },
    thresholds: {
      freeTier70bPerDay: 14_400,
      alertThreshold70b: 11_500,   // 80% du free tier
    },
  })
})
