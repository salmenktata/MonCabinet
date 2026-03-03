/**
 * GET /api/admin/quotas/unified
 *
 * Endpoint unifié pour le tableau de bord Coûts & Limites IA.
 * Agrège en un seul appel :
 *  - KPIs globaux (coût mois, prévision fin-mois)
 *  - Limites temps réel par modèle (Groq via Redis, DeepSeek via Redis, OpenAI/Ollama via DB)
 *  - Tendance journalière 30j par provider
 *  - Top 10 utilisateurs ce mois
 *  - Breakdown par opération ce mois
 *
 * Auth : super-admin uniquement
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { getGroqDailyStats } from '@/lib/ai/groq-usage-tracker'
import { getDeepSeekDailyStats } from '@/lib/ai/deepseek-usage-tracker'

// ─── Limites statiques par modèle ─────────────────────────────────────────────
// Source : docs officiels des providers (vérifiés mars 2026)
const MODEL_LIMITS: Array<{
  provider: string
  model: string
  tier: 'free' | 'paid' | 'local'
  limits: Array<{
    type: 'RPD' | 'TPD' | 'RPM' | 'TPM' | 'Budget'
    value: number | null
    unit?: string
    monthlyBudgetUsd?: number
  }>
}> = [
  {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    tier: 'free',
    limits: [
      { type: 'RPD', value: 1_000 },
      { type: 'TPD', value: 100_000 },
      { type: 'RPM', value: 30 },
    ],
  },
  {
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    tier: 'free',
    limits: [
      { type: 'RPD', value: 14_400 },
      { type: 'TPD', value: 500_000 },
      { type: 'RPM', value: 30 },
    ],
  },
  {
    provider: 'deepseek',
    model: 'deepseek-chat',
    tier: 'paid',
    limits: [
      { type: 'Budget', value: 10, unit: 'USD/mois', monthlyBudgetUsd: 10 },
    ],
  },
  {
    provider: 'openai',
    model: 'text-embedding-3-small',
    tier: 'paid',
    limits: [
      { type: 'RPM', value: 5_000 },
      { type: 'Budget', value: 10, unit: 'USD/mois', monthlyBudgetUsd: 10 },
    ],
  },
  {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    tier: 'paid',
    limits: [
      { type: 'RPM', value: 5_000 },
      { type: 'TPD', value: 20_000_000 },
    ],
  },
  {
    provider: 'gemini',
    model: 'gemini-2.0-flash-lite',
    tier: 'paid',
    limits: [
      { type: 'RPM', value: 4_000 },
      { type: 'Budget', value: 1, unit: 'USD/mois', monthlyBudgetUsd: 1 },
    ],
  },
  {
    provider: 'ollama',
    model: 'nomic-embed-text',
    tier: 'local',
    limits: [{ type: 'RPD', value: null }],
  },
  {
    provider: 'ollama',
    model: 'qwen3-nothink',
    tier: 'local',
    limits: [{ type: 'RPD', value: null }],
  },
]

// ─── Pricing pour prévision ────────────────────────────────────────────────────
const PROVIDER_PRICING: Record<string, { input: number; output: number }> = {
  deepseek: { input: 0.028 / 1_000_000, output: 0.42 / 1_000_000 },
  openai: { input: 0.02 / 1_000_000, output: 0.02 / 1_000_000 },
  gemini: { input: 0.075 / 1_000_000, output: 0.30 / 1_000_000 },
  groq: { input: 0, output: 0 }, // free tier
  ollama: { input: 0, output: 0 },
  anthropic: { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
}

// ─── Statut de limite ──────────────────────────────────────────────────────────
function getLimitStatus(percent: number, limitValue: number | null): 'ok' | 'warning' | 'critical' | 'unlimited' {
  if (limitValue === null) return 'unlimited'
  if (percent >= 80) return 'critical'
  if (percent >= 50) return 'warning'
  return 'ok'
}

// ─── Handler principal ────────────────────────────────────────────────────────
export const GET = withAdminApiAuth(async (_request, _ctx, _session) => {
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date()
  const daysElapsed = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysRemaining = daysInMonth - daysElapsed

  // Exécuter toutes les requêtes DB en parallèle
  const [
    dailyTrendRows,
    topUsersRows,
    byOperationRows,
    todayTotalRow,
    monthCostRow,
    groqStats,
    deepseekStats,
  ] = await Promise.all([
    // Tendance 30j par provider
    db.query(`
      SELECT
        DATE(created_at) as date,
        provider,
        SUM(input_tokens + output_tokens) as tokens,
        SUM(estimated_cost_usd) as cost,
        COUNT(*) as requests
      FROM ai_usage_logs
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at), provider
      ORDER BY date DESC, provider
    `),

    // Top 10 users ce mois
    db.query(`
      SELECT
        l.user_id,
        u.email,
        u.name,
        SUM(l.input_tokens + l.output_tokens) as total_tokens,
        SUM(l.estimated_cost_usd) as total_cost_usd,
        COUNT(*)::int as requests_count
      FROM ai_usage_logs l
      LEFT JOIN users u ON u.id::text = l.user_id::text
      WHERE DATE_TRUNC('month', l.created_at) = DATE_TRUNC('month', CURRENT_DATE)
        AND l.user_id IS NOT NULL
      GROUP BY l.user_id, u.email, u.name
      ORDER BY total_tokens DESC
      LIMIT 10
    `),

    // Breakdown par opération ce mois
    db.query(`
      SELECT
        operation_type,
        provider,
        model,
        COUNT(*)::int as requests,
        SUM(input_tokens)::bigint as input_tokens,
        SUM(output_tokens)::bigint as output_tokens,
        SUM(input_tokens + output_tokens)::bigint as total_tokens,
        SUM(estimated_cost_usd) as cost_usd
      FROM ai_usage_logs
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY operation_type, provider, model
      ORDER BY cost_usd DESC NULLS LAST
    `),

    // Total requêtes aujourd'hui
    db.query(`
      SELECT COUNT(*)::int as total
      FROM ai_usage_logs
      WHERE DATE(created_at) = CURRENT_DATE
    `),

    // Coût total ce mois par provider (pour KPIs + forecast)
    db.query(`
      SELECT
        provider,
        SUM(estimated_cost_usd) as cost_usd,
        SUM(input_tokens + output_tokens) as tokens
      FROM ai_usage_logs
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY provider
    `),

    // Redis Groq (aujourd'hui)
    getGroqDailyStats(1),
    // Redis DeepSeek (aujourd'hui)
    getDeepSeekDailyStats(1),
  ])

  // ─── KPIs globaux ───────────────────────────────────────────────────────────
  let totalCostMonthUsd = 0
  let topProviderByTokens = 'ollama'
  let topProviderByCost = 'ollama'
  let maxTokens = 0
  let maxCost = 0

  const costByProvider: Record<string, number> = {}
  const tokensByProvider: Record<string, number> = {}

  for (const row of monthCostRow.rows) {
    const cost = parseFloat(row.cost_usd || '0')
    const tokens = parseInt(row.tokens || '0', 10)
    totalCostMonthUsd += cost
    costByProvider[row.provider] = cost
    tokensByProvider[row.provider] = tokens
    if (tokens > maxTokens) { maxTokens = tokens; topProviderByTokens = row.provider }
    if (cost > maxCost) { maxCost = cost; topProviderByCost = row.provider }
  }

  // Forecast linéaire
  const dailyAvg = daysElapsed > 0 ? totalCostMonthUsd / daysElapsed : 0
  const forecastEndOfMonthUsd = totalCostMonthUsd + dailyAvg * daysRemaining

  // ─── Limites temps réel ──────────────────────────────────────────────────────
  const groqToday = groqStats[0] // stats du jour
  const deepseekToday = deepseekStats[0]

  // Usage Redis par modèle Groq
  const groqModelUsage: Record<string, { calls: number; tokensIn: number; tokensOut: number }> = {}
  if (groqToday?.byModel) {
    for (const [model, data] of Object.entries(groqToday.byModel)) {
      groqModelUsage[model] = { calls: data.calls, tokensIn: data.tokensIn, tokensOut: data.tokensOut }
    }
  }

  const deepseekModelUsage: Record<string, { calls: number; tokensIn: number; tokensOut: number }> = {}
  if (deepseekToday?.byModel) {
    for (const [model, data] of Object.entries(deepseekToday.byModel)) {
      deepseekModelUsage[model] = { calls: data.calls, tokensIn: data.tokensIn, tokensOut: data.tokensOut }
    }
  }

  // Coût DeepSeek du jour depuis Redis
  let deepseekTodayCost = 0
  for (const data of Object.values(deepseekModelUsage)) {
    deepseekTodayCost += PROVIDER_PRICING.deepseek.input * data.tokensIn + PROVIDER_PRICING.deepseek.output * data.tokensOut
  }

  // Coût OpenAI du mois depuis DB
  const openaiMonthCost = costByProvider['openai'] || 0

  const activeAlerts: string[] = []

  const rateLimits = MODEL_LIMITS.flatMap(({ provider, model, tier, limits }) =>
    limits.map(limit => {
      let usedToday = 0

      if (limit.type === 'Budget') {
        // Budget mensuel
        if (provider === 'deepseek') usedToday = deepseekTodayCost * 30 // extrapolation mensuelle simplifiée
        else if (provider === 'openai') usedToday = openaiMonthCost
        else if (provider === 'gemini') usedToday = costByProvider['gemini'] || 0
      } else if (limit.type === 'RPD') {
        if (provider === 'groq') usedToday = groqModelUsage[model]?.calls || 0
        else if (provider === 'deepseek') usedToday = deepseekModelUsage[model]?.calls || 0
      } else if (limit.type === 'TPD') {
        if (provider === 'groq') {
          const u = groqModelUsage[model]
          usedToday = u ? u.tokensIn + u.tokensOut : 0
        } else if (provider === 'deepseek') {
          const u = deepseekModelUsage[model]
          usedToday = u ? u.tokensIn + u.tokensOut : 0
        }
      } else if (limit.type === 'RPM') {
        // RPM pas facilement disponible sans compteur temps réel → 0
        usedToday = 0
      }

      const percentUsed = limit.value !== null ? Math.min(100, (usedToday / limit.value) * 100) : 0
      const status = getLimitStatus(percentUsed, limit.value)

      if (status === 'critical') {
        activeAlerts.push(`${provider}/${model} ${limit.type} > 80%`)
      }

      const source: 'redis' | 'db' = (provider === 'groq' || provider === 'deepseek') && limit.type !== 'Budget'
        ? 'redis'
        : 'db'

      return {
        provider,
        model,
        tier,
        limitType: limit.type,
        limitValue: limit.value,
        unit: limit.unit,
        usedToday,
        percentUsed: Math.round(percentUsed * 10) / 10,
        status,
        source,
      }
    })
  )

  // ─── Tendance 30j structurée ─────────────────────────────────────────────────
  const trendByDate: Record<string, {
    byProvider: Record<string, { tokens: number; cost: number; requests: number }>
    total: { tokens: number; cost: number; requests: number }
  }> = {}

  for (const row of dailyTrendRows.rows) {
    const date = row.date instanceof Date
      ? row.date.toISOString().slice(0, 10)
      : String(row.date)
    if (!trendByDate[date]) {
      trendByDate[date] = { byProvider: {}, total: { tokens: 0, cost: 0, requests: 0 } }
    }
    const tokens = parseInt(row.tokens || '0', 10)
    const cost = parseFloat(row.cost || '0')
    const requests = parseInt(row.requests || '0', 10)
    trendByDate[date].byProvider[row.provider] = { tokens, cost, requests }
    trendByDate[date].total.tokens += tokens
    trendByDate[date].total.cost += cost
    trendByDate[date].total.requests += requests
  }

  // Générer les 30 derniers jours (même si pas de données)
  const dailyTrend = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const date = d.toISOString().slice(0, 10)
    return { date, ...(trendByDate[date] || { byProvider: {}, total: { tokens: 0, cost: 0, requests: 0 } }) }
  })

  // ─── Top users ───────────────────────────────────────────────────────────────
  const topUsers = topUsersRows.rows.map(row => ({
    userId: row.user_id,
    email: row.email || null,
    name: row.name || null,
    totalTokens: parseInt(row.total_tokens || '0', 10),
    totalCostUsd: parseFloat(row.total_cost_usd || '0'),
    requestsCount: parseInt(row.requests_count || '0', 10),
  }))

  // ─── By operation ────────────────────────────────────────────────────────────
  const byOperation = byOperationRows.rows.map(row => ({
    operationType: row.operation_type,
    provider: row.provider,
    model: row.model || null,
    requests: row.requests,
    inputTokens: parseInt(row.input_tokens || '0', 10),
    outputTokens: parseInt(row.output_tokens || '0', 10),
    totalTokens: parseInt(row.total_tokens || '0', 10),
    costUsd: parseFloat(row.cost_usd || '0'),
  }))

  return NextResponse.json({
    summary: {
      totalCostMonthUsd,
      forecastEndOfMonthUsd,
      forecastDaysRemaining: daysRemaining,
      topProviderByTokens,
      topProviderByCost,
      totalRequestsToday: todayTotalRow.rows[0]?.total || 0,
      activeAlerts,
      currentDate: today,
      daysElapsed,
      daysInMonth,
    },
    rateLimits,
    dailyTrend,
    topUsers,
    byOperation,
  })
})
