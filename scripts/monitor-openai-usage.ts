#!/usr/bin/env tsx
/**
 * Script de monitoring de l'usage OpenAI
 *
 * Vérifie la consommation OpenAI et alerte si proche de la limite
 *
 * Usage:
 *   npx tsx scripts/monitor-openai-usage.ts
 *
 * Cron (quotidien 9h):
 *   0 9 * * * cd /opt/qadhya && npx tsx scripts/monitor-openai-usage.ts
 */

import OpenAI from 'openai'

// =============================================================================
// CONFIGURATION
// =============================================================================

const ALERT_THRESHOLD_USD = 5.0  // Alerte si solde < 5$
const MONTHLY_BUDGET_USD = 10.0  // Budget mensuel max

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('🔍 Vérification usage OpenAI...\n')

  // Initialiser client OpenAI
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  try {
    // Note: OpenAI ne fournit plus d'API publique pour vérifier le solde
    // On peut seulement tracker l'usage via les métadonnées de réponse

    // Alternative: Vérifier qu'une requête simple fonctionne
    const testResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 5,
    })

    console.log('✅ OpenAI accessible')
    console.log(`   Modèle: ${testResponse.model}`)
    console.log(`   Tokens: ${testResponse.usage?.total_tokens || 0}`)

    // Vérifier via DB notre consommation trackée
    const { db } = await import('../lib/db/postgres')

    const usageStats = await db.query<{
      total_calls: number
      total_tokens: number
      estimated_cost_usd: number
      period_start: Date
    }>(`
      SELECT
        COUNT(*) as total_calls,
        SUM(input_tokens + output_tokens) as total_tokens,
        -- Estimation coût (gpt-4o: $0.0025/1K input, $0.01/1K output)
        SUM(
          (input_tokens * 0.0025 / 1000) +
          (output_tokens * 0.01 / 1000)
        ) as estimated_cost_usd,
        MIN(created_at) as period_start
      FROM llm_operations
      WHERE provider = 'openai'
        AND operation_name LIKE '%quality-analysis%'
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
    `)

    const stats = usageStats.rows[0]

    console.log('\n📊 Usage OpenAI ce mois:')
    console.log(`   Appels: ${stats.total_calls}`)
    console.log(`   Tokens: ${stats.total_tokens?.toLocaleString() || 0}`)
    console.log(`   Coût estimé: $${(stats.estimated_cost_usd || 0).toFixed(2)}`)
    console.log(`   Période: ${stats.period_start ? new Date(stats.period_start).toLocaleDateString('fr-FR') : 'N/A'} - aujourd'hui`)

    // Calculer budget restant
    const budgetRemaining = MONTHLY_BUDGET_USD - (stats.estimated_cost_usd || 0)

    console.log(`\n💰 Budget mensuel:`)
    console.log(`   Budget total: $${MONTHLY_BUDGET_USD.toFixed(2)}`)
    console.log(`   Consommé: $${(stats.estimated_cost_usd || 0).toFixed(2)}`)
    console.log(`   Restant: $${budgetRemaining.toFixed(2)}`)

    // Alertes
    if (budgetRemaining < ALERT_THRESHOLD_USD) {
      console.log(`\n⚠️  ALERTE: Budget restant < $${ALERT_THRESHOLD_USD}`)
      console.log(`   Action recommandée: Vérifier solde OpenAI ou basculer sur Ollama`)
      process.exit(1)
    }

    if (budgetRemaining < MONTHLY_BUDGET_USD * 0.2) {
      console.log(`\n⚡ WARNING: Budget à ${((1 - budgetRemaining/MONTHLY_BUDGET_USD) * 100).toFixed(0)}%`)
    }

    console.log('\n✅ Monitoring OK')

  } catch (error) {
    console.error('\n❌ ERREUR OpenAI:', error.message)

    if (error.status === 401) {
      console.error('   → Clé API invalide ou expirée')
    } else if (error.status === 429) {
      console.error('   → Quota dépassé ou rate limit')
    } else if (error.code === 'insufficient_quota') {
      console.error('   → SOLDE ÉPUISÉ - Recharger le compte OpenAI')
    }

    console.error('\n⚠️  Le système basculera automatiquement sur Ollama (fallback)')
    process.exit(1)
  }
}

main().catch(console.error)
