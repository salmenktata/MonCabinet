/**
 * GET /api/admin/monitoring/gemini-costs
 * Retourne les stats de coûts Gemini (LLM + embeddings) des 7 derniers jours.
 * Protégé par session super-admin (middleware).
 */
import { NextResponse } from 'next/server'
import { getGeminiDailyCosts, getGeminiRPMStats } from '@/lib/ai/gemini-client'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const GET = withAdminApiAuth(async (_request, _ctx, _session) => {
  const [costs, rpmStats] = await Promise.all([
    getGeminiDailyCosts(7),
    Promise.resolve(getGeminiRPMStats()),
  ])

  return NextResponse.json({
    status: 'ok',
    rpmStats,
    costs,
    thresholds: {
      dailyLLMCallsAlert: 50,
      dailyCostUSDAlert: 1.0,
    },
  })
})
