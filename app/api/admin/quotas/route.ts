/**
 * API - Quotas & Alertes Providers IA
 *
 * Retourne l'usage quotidien/mensuel des providers avec limites tier gratuit
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'

// Quotas providers (tier gratuit)
const PROVIDER_QUOTAS = {
  gemini: {
    tokensPerDay: 1_000_000,      // 1M tokens/jour
    tokensPerMonth: 30_000_000,   // 30M tokens/mois
    rpm: 15,                       // 15 requests/minute
    costPerMTokenInput: 0.075,     // $0.075/M tokens input
    costPerMTokenOutput: 0.30,     // $0.30/M tokens output
  },
  deepseek: {
    tokensPerDay: null,            // Pas de limite gratuite
    tokensPerMonth: null,
    rpm: null,
    costPerMTokenInput: 0.27,      // $0.27/M tokens
    costPerMTokenOutput: 1.10,
  },
  groq: {
    tokensPerDay: 14_400,          // Limite tier gratuit
    tokensPerMonth: null,
    rpm: 30,
    costPerMTokenInput: 0.05,
    costPerMTokenOutput: 0.08,
  },
  ollama: {
    tokensPerDay: null,            // Local, pas de limite
    tokensPerMonth: null,
    rpm: null,
    costPerMTokenInput: 0,
    costPerMTokenOutput: 0,
  },
}

export async function GET(req: NextRequest) {
  try {
    // Vérifier auth admin
    const session = await getSession()
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const provider = searchParams.get('provider') || 'gemini'

    // Usage aujourd'hui
    const todayUsage = await db.query(
      `SELECT
        operation_type,
        COUNT(*) as requests,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(estimated_cost_usd) as cost_usd
      FROM ai_usage_logs
      WHERE DATE(created_at) = CURRENT_DATE
        AND provider = $1
      GROUP BY operation_type
      ORDER BY total_tokens DESC NULLS LAST`,
      [provider]
    )

    // Usage ce mois
    const monthUsage = await db.query(
      `SELECT
        operation_type,
        COUNT(*) as requests,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(estimated_cost_usd) as cost_usd
      FROM ai_usage_logs
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
        AND provider = $1
      GROUP BY operation_type
      ORDER BY total_tokens DESC NULLS LAST`,
      [provider]
    )

    // Tendance 7 derniers jours
    const trend = await db.query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as requests,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(estimated_cost_usd) as cost_usd
      FROM ai_usage_logs
      WHERE created_at > NOW() - INTERVAL '7 days'
        AND provider = $1
      GROUP BY DATE(created_at)
      ORDER BY date DESC`,
      [provider]
    )

    // RPM actuel (dernière minute)
    const currentRPM = await db.query(
      `SELECT COUNT(*) as requests
      FROM ai_usage_logs
      WHERE created_at > NOW() - INTERVAL '1 minute'
        AND provider = $1`,
      [provider]
    )

    // Calculer totaux
    const todayTotal = todayUsage.rows.reduce((sum, row) => sum + parseInt(row.total_tokens || 0), 0)
    const monthTotal = monthUsage.rows.reduce((sum, row) => sum + parseInt(row.total_tokens || 0), 0)
    const todayCost = todayUsage.rows.reduce((sum, row) => sum + parseFloat(row.cost_usd || 0), 0)
    const monthCost = monthUsage.rows.reduce((sum, row) => sum + parseFloat(row.cost_usd || 0), 0)

    const quotas = PROVIDER_QUOTAS[provider as keyof typeof PROVIDER_QUOTAS] || {}

    return NextResponse.json({
      provider,
      today: {
        total_tokens: todayTotal,
        cost_usd: todayCost,
        operations: todayUsage.rows,
        quota: quotas.tokensPerDay,
        usage_percent: quotas.tokensPerDay ? (todayTotal / quotas.tokensPerDay) * 100 : 0,
      },
      month: {
        total_tokens: monthTotal,
        cost_usd: monthCost,
        operations: monthUsage.rows,
        quota: quotas.tokensPerMonth,
        usage_percent: quotas.tokensPerMonth ? (monthTotal / quotas.tokensPerMonth) * 100 : 0,
      },
      current_rpm: parseInt(currentRPM.rows[0]?.requests || 0),
      rpm_limit: quotas.rpm,
      trend: trend.rows,
      quotas,
    })
  } catch (error) {
    console.error('[API] Erreur récupération quotas:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
