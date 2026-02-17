import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { db } from '@/lib/db/postgres'
import { getErrorMessage } from '@/lib/utils/error-utils'

/**
 * GET /api/admin/monitor-openai
 *
 * Monitoring budget OpenAI avec projections et alertes progressives
 *
 * Features:
 * - Test connexion OpenAI
 * - Burn rate quotidien (moyenne 7j)
 * - Projection date épuisement budget
 * - Alertes progressives (80%, 90%, 95%)
 * - Historique usage par jour (7 derniers jours)
 *
 * Headers:
 * - X-Cron-Secret: Secret cron pour authentification
 *
 * @returns Rapport de monitoring complet
 */
export async function GET(request: NextRequest) {
  try {
    // Vérifier le secret cron
    const cronSecret = request.headers.get('X-Cron-Secret')
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Monitor OpenAI] Démarrage vérification...')

    // Configuration
    const MONTHLY_BUDGET_USD = 10.0
    const COST_PER_DOC = (500 * 0.0025 + 200 * 0.01) / 1000 // ~$0.003/doc

    // Test connexion OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    let openaiStatus = 'unknown'
    let testError = null

    try {
      const testResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5,
      })
      openaiStatus = 'accessible'
      console.log(`[Monitor OpenAI] ✅ OpenAI accessible (${testResponse.model})`)
    } catch (error) {
      openaiStatus = 'error'
      testError = getErrorMessage(error)

      // Type guard pour erreurs OpenAI
      if (error && typeof error === 'object' && 'status' in error) {
        if (error.status === 401) testError = 'Clé API invalide ou expirée'
        else if (error.status === 429) testError = 'Quota dépassé ou rate limit'
      }

      if (error && typeof error === 'object' && 'code' in error && error.code === 'insufficient_quota') {
        testError = 'SOLDE ÉPUISÉ'
      }
    }

    // Stats mois en cours
    const monthlyStats = await db.query<{
      total_analyzed: string
      openai_count: string
      first_openai_date: string
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE quality_score IS NOT NULL) as total_analyzed,
        COUNT(*) FILTER (WHERE quality_llm_provider = 'openai') as openai_count,
        MIN(updated_at) FILTER (WHERE quality_llm_provider = 'openai') as first_openai_date
      FROM knowledge_base
      WHERE is_active = true
        AND updated_at >= DATE_TRUNC('month', CURRENT_DATE)
    `)

    const stats = monthlyStats.rows[0]
    const openaiCount = parseInt(stats.openai_count || '0', 10)
    const costUsd = openaiCount * COST_PER_DOC
    const budgetRemaining = MONTHLY_BUDGET_USD - costUsd
    const percentUsed = (costUsd / MONTHLY_BUDGET_USD) * 100

    // Historique usage 7 jours (burn rate)
    const dailyUsage = await db.query<{
      day: string
      openai_docs: string
      total_docs: string
    }>(`
      SELECT
        DATE(updated_at) as day,
        COUNT(*) FILTER (WHERE quality_llm_provider = 'openai') as openai_docs,
        COUNT(*) as total_docs
      FROM knowledge_base
      WHERE is_active = true
        AND quality_score IS NOT NULL
        AND updated_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(updated_at)
      ORDER BY day DESC
    `)

    const dailyHistory = dailyUsage.rows.map((row) => ({
      date: row.day,
      openaiDocs: parseInt(row.openai_docs || '0', 10),
      totalDocs: parseInt(row.total_docs || '0', 10),
      estimatedCost: parseInt(row.openai_docs || '0', 10) * COST_PER_DOC,
    }))

    // Burn rate (moyenne quotidienne sur 7 jours)
    const totalDocsLast7Days = dailyHistory.reduce((sum, d) => sum + d.openaiDocs, 0)
    const activeDays = dailyHistory.length || 1
    const avgDocsPerDay = totalDocsLast7Days / activeDays
    const burnRatePerDay = avgDocsPerDay * COST_PER_DOC

    // Projections
    const daysRemaining = burnRatePerDay > 0 ? Math.floor(budgetRemaining / burnRatePerDay) : 999
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const daysLeftInMonth = daysInMonth - now.getDate()
    const projectedMonthlyTotal = costUsd + burnRatePerDay * daysLeftInMonth
    const projectedExhaustionDate =
      burnRatePerDay > 0
        ? new Date(now.getTime() + daysRemaining * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : null

    // Alertes progressives
    let alertLevel = 'ok'
    let alertMessage = null
    const alerts: string[] = []

    if (openaiStatus === 'error') {
      alertLevel = 'critical'
      alertMessage = `OpenAI inaccessible: ${testError}`
      alerts.push(`CRITICAL: ${alertMessage}`)
    }

    if (percentUsed >= 95) {
      alertLevel = 'critical'
      alertMessage = `Budget à ${percentUsed.toFixed(0)}% - QUASI ÉPUISÉ`
      alerts.push(`CRITICAL: Budget ${percentUsed.toFixed(0)}% utilisé ($${budgetRemaining.toFixed(2)} restant)`)
    } else if (percentUsed >= 90) {
      if (alertLevel !== 'critical') alertLevel = 'warning'
      alerts.push(`WARNING: Budget à ${percentUsed.toFixed(0)}% ($${budgetRemaining.toFixed(2)} restant)`)
    } else if (percentUsed >= 80) {
      if (alertLevel === 'ok') alertLevel = 'warning'
      alerts.push(`WARNING: Budget à ${percentUsed.toFixed(0)}%`)
    }

    if (daysRemaining < 7 && daysRemaining < daysLeftInMonth && burnRatePerDay > 0) {
      if (alertLevel === 'ok') alertLevel = 'warning'
      alerts.push(`WARNING: Budget épuisé dans ~${daysRemaining} jours (avant fin du mois)`)
    }

    if (projectedMonthlyTotal > MONTHLY_BUDGET_USD * 1.1) {
      alerts.push(
        `INFO: Projection mois = $${projectedMonthlyTotal.toFixed(2)} (dépassement ${((projectedMonthlyTotal / MONTHLY_BUDGET_USD - 1) * 100).toFixed(0)}%)`
      )
    }

    if (alerts.length > 0 && !alertMessage) {
      alertMessage = alerts[0]
    }

    const result = {
      timestamp: new Date().toISOString(),
      openai: {
        status: openaiStatus,
        error: testError,
      },
      usage: {
        totalAnalyzedThisMonth: parseInt(stats.total_analyzed || '0', 10),
        openaiDocsThisMonth: openaiCount,
        estimatedCostUsd: parseFloat(costUsd.toFixed(2)),
      },
      budget: {
        totalUsd: MONTHLY_BUDGET_USD,
        consumedUsd: parseFloat(costUsd.toFixed(2)),
        remainingUsd: parseFloat(budgetRemaining.toFixed(2)),
        percentUsed: parseFloat(percentUsed.toFixed(1)),
      },
      burnRate: {
        avgDocsPerDay: parseFloat(avgDocsPerDay.toFixed(1)),
        avgCostPerDay: parseFloat(burnRatePerDay.toFixed(4)),
        activeDaysLast7: activeDays,
        totalDocsLast7Days,
      },
      projections: {
        daysUntilExhaustion: daysRemaining,
        exhaustionDate: projectedExhaustionDate,
        projectedMonthlyTotal: parseFloat(projectedMonthlyTotal.toFixed(2)),
        daysLeftInMonth,
        willExceedBudget: projectedMonthlyTotal > MONTHLY_BUDGET_USD,
      },
      dailyHistory,
      alert: {
        level: alertLevel,
        message: alertMessage,
        details: alerts,
      },
    }

    console.log('[Monitor OpenAI] Résultat:', JSON.stringify(result, null, 2))

    return NextResponse.json(result, {
      status: alertLevel === 'critical' ? 500 : 200,
    })
  } catch (error) {
    console.error('[Monitor OpenAI] Erreur:', error)
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        error: getErrorMessage(error),
        alert: { level: 'critical', message: 'Erreur monitoring OpenAI', details: [] },
      },
      { status: 500 }
    )
  }
}
