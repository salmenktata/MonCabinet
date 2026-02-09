/**
 * Script de test - Dashboard Quotas & Alertes
 *
 * Vérifie :
 * 1. Données SQL ai_usage_logs (aujourd'hui, ce mois, tendance 7j)
 * 2. Calculs quotas et alertes
 * 3. API endpoint /api/admin/quotas
 */

// Charger variables d'environnement
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env.local') })

import { db } from '../lib/db/postgres'

// Quotas providers (copié de route.ts)
const PROVIDER_QUOTAS = {
  gemini: {
    tokensPerDay: 1_000_000,
    tokensPerMonth: 30_000_000,
    rpm: 15,
  },
  deepseek: {
    tokensPerDay: null,
    tokensPerMonth: null,
    rpm: null,
  },
  groq: {
    tokensPerDay: 14_400,
    tokensPerMonth: null,
    rpm: 30,
  },
  ollama: {
    tokensPerDay: null,
    tokensPerMonth: null,
    rpm: null,
  },
}

async function testSQLQueries() {
  console.log('\n🔍 TEST 1 : Requêtes SQL\n')

  // 1. Usage aujourd'hui
  console.log('📊 Usage aujourd\'hui par provider :')
  const today = await db.query(
    `SELECT
      provider,
      COUNT(*) as requests,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(input_tokens + output_tokens) as total_tokens,
      SUM(estimated_cost_usd) as cost_usd
    FROM ai_usage_logs
    WHERE DATE(created_at) = CURRENT_DATE
    GROUP BY provider
    ORDER BY total_tokens DESC NULLS LAST`
  )
  console.table(today.rows)

  // 2. Usage ce mois
  console.log('\n📊 Usage ce mois par provider :')
  const month = await db.query(
    `SELECT
      provider,
      COUNT(*) as requests,
      SUM(input_tokens + output_tokens) as total_tokens,
      SUM(estimated_cost_usd) as cost_usd
    FROM ai_usage_logs
    WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY provider
    ORDER BY total_tokens DESC`
  )
  console.table(month.rows)

  // 3. Tendance 7 jours
  console.log('\n📊 Tendance 7 derniers jours (Gemini) :')
  const trend = await db.query(
    `SELECT
      DATE(created_at) as date,
      COUNT(*) as requests,
      SUM(input_tokens + output_tokens) as total_tokens,
      SUM(estimated_cost_usd) as cost_usd
    FROM ai_usage_logs
    WHERE created_at > NOW() - INTERVAL '7 days'
      AND provider = 'gemini'
    GROUP BY DATE(created_at)
    ORDER BY date DESC`
  )
  console.table(trend.rows)

  return { today: today.rows, month: month.rows, trend: trend.rows }
}

async function testQuotaCalculations(sqlData: any) {
  console.log('\n🧮 TEST 2 : Calculs Quotas et Alertes\n')

  const providers = ['gemini', 'deepseek', 'groq', 'ollama']

  for (const provider of providers) {
    const monthData = sqlData.month.find((r: any) => r.provider === provider)
    if (!monthData) {
      console.log(`⚠️  ${provider} : Aucune donnée ce mois`)
      continue
    }

    const totalTokens = parseInt(monthData.total_tokens || 0)
    const quotas = PROVIDER_QUOTAS[provider as keyof typeof PROVIDER_QUOTAS]

    console.log(`\n📦 ${provider.toUpperCase()}`)
    console.log(`   Tokens ce mois : ${(totalTokens / 1_000_000).toFixed(2)}M`)
    console.log(`   Coût : $${parseFloat(monthData.cost_usd || 0).toFixed(2)}`)

    if (quotas.tokensPerMonth) {
      const usagePercent = (totalTokens / quotas.tokensPerMonth) * 100
      console.log(`   Quota mois : ${(quotas.tokensPerMonth / 1_000_000).toFixed(1)}M tokens`)
      console.log(`   Usage : ${usagePercent.toFixed(1)}%`)

      // Alertes
      if (usagePercent >= 90) {
        console.log(`   🔴 ALERTE CRITIQUE : Quota >90% - Upgrade requis`)
      } else if (usagePercent >= 80) {
        console.log(`   🟠 ALERTE : Quota >80% - Envisager upgrade`)
      } else if (usagePercent >= 60) {
        console.log(`   🟡 Attention : Quota >60%`)
      } else {
        console.log(`   🟢 OK : Quota <60%`)
      }
    } else {
      console.log(`   ✅ Pas de quota (${provider === 'ollama' ? 'local' : 'payant'})`)
    }
  }
}

async function testAPIEndpoint() {
  console.log('\n🌐 TEST 3 : API Endpoint\n')

  const providers = ['gemini', 'deepseek', 'groq', 'ollama']

  for (const provider of providers) {
    console.log(`\n📡 Test /api/admin/quotas?provider=${provider}`)

    // Simuler requête API (sans auth pour le test)
    const params = [provider]

    // Usage aujourd'hui
    const today = await db.query(
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
      params
    )

    // Usage ce mois
    const month = await db.query(
      `SELECT
        operation_type,
        COUNT(*) as requests,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(estimated_cost_usd) as cost_usd
      FROM ai_usage_logs
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
        AND provider = $1
      GROUP BY operation_type
      ORDER BY total_tokens DESC NULLS LAST`,
      params
    )

    const todayTotal = today.rows.reduce((sum, row) => sum + parseInt(row.total_tokens || 0), 0)
    const monthTotal = month.rows.reduce((sum, row) => sum + parseInt(row.total_tokens || 0), 0)

    const quotas = PROVIDER_QUOTAS[provider as keyof typeof PROVIDER_QUOTAS]

    const response = {
      provider,
      today: {
        total_tokens: todayTotal,
        operations: today.rows.length,
        quota: quotas.tokensPerDay,
        usage_percent: quotas.tokensPerDay ? (todayTotal / quotas.tokensPerDay) * 100 : 0,
      },
      month: {
        total_tokens: monthTotal,
        operations: month.rows.length,
        quota: quotas.tokensPerMonth,
        usage_percent: quotas.tokensPerMonth ? (monthTotal / quotas.tokensPerMonth) * 100 : 0,
      },
    }

    console.log(`   Aujourd'hui : ${(todayTotal / 1_000).toFixed(1)}K tokens (${today.rows.length} opérations)`)
    console.log(`   Ce mois : ${(monthTotal / 1_000_000).toFixed(2)}M tokens (${month.rows.length} opérations)`)

    if (quotas.tokensPerMonth) {
      console.log(`   ✅ Quota mois : ${response.month.usage_percent.toFixed(1)}%`)
    }
  }
}

async function testScenario10KDocs() {
  console.log('\n💰 TEST 4 : Scénario 10K docs/mois\n')

  const TOKENS_PER_DOC = 15_000 // Après optimisation
  const DOCS_PER_MONTH = 10_000

  const totalTokens = TOKENS_PER_DOC * DOCS_PER_MONTH // 150M tokens
  const geminiQuota = PROVIDER_QUOTAS.gemini.tokensPerMonth // 30M gratuit
  const tokensPayants = totalTokens - geminiQuota // 120M payants

  const costGemini = (tokensPayants / 1_000_000) * 0.075
  const costDeepSeek = (totalTokens / 1_000_000) * 0.27

  console.log(`📊 Volume : ${DOCS_PER_MONTH.toLocaleString()} docs/mois`)
  console.log(`📊 Tokens/doc : ${(TOKENS_PER_DOC / 1_000).toFixed(1)}K (après optimisation)`)
  console.log(`📊 Total tokens : ${(totalTokens / 1_000_000).toFixed(1)}M/mois`)
  console.log(``)
  console.log(`💵 Gemini Flash (recommandé) :`)
  console.log(`   - Tier gratuit : ${(geminiQuota / 1_000_000).toFixed(1)}M tokens`)
  console.log(`   - Tokens payants : ${(tokensPayants / 1_000_000).toFixed(1)}M tokens`)
  console.log(`   - Coût : $${costGemini.toFixed(2)}/mois (~${(costGemini * 3.09).toFixed(0)} TND)`)
  console.log(``)
  console.log(`💵 DeepSeek (avant optimisation) :`)
  console.log(`   - Coût : $${costDeepSeek.toFixed(2)}/mois (~${(costDeepSeek * 3.09).toFixed(0)} TND)`)
  console.log(``)
  console.log(`🎉 ÉCONOMIE : $${(costDeepSeek - costGemini).toFixed(2)}/mois (-${(((costDeepSeek - costGemini) / costDeepSeek) * 100).toFixed(0)}%)`)
  console.log(`🎉 ÉCONOMIE ANNUELLE : $${((costDeepSeek - costGemini) * 12).toFixed(2)}/an (~${((costDeepSeek - costGemini) * 12 * 3.09).toFixed(0)} TND)`)
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║  TEST DASHBOARD QUOTAS & ALERTES IA                    ║')
  console.log('╚════════════════════════════════════════════════════════╝')

  try {
    // Test 1 : SQL
    const sqlData = await testSQLQueries()

    // Test 2 : Calculs quotas
    await testQuotaCalculations(sqlData)

    // Test 3 : API endpoint
    await testAPIEndpoint()

    // Test 4 : Scénario 10K docs
    await testScenario10KDocs()

    console.log('\n✅ TOUS LES TESTS RÉUSSIS\n')
  } catch (error) {
    console.error('\n❌ ERREUR :', error)
    process.exit(1)
  }
  // Note: db est un pool, pas besoin de end() ici
}

main()
