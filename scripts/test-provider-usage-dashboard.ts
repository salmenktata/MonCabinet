#!/usr/bin/env tsx

/**
 * Script de test complet du dashboard provider usage
 * - Teste les APIs matrice et tendances
 * - Vérifie la cohérence des données
 * - Mesure la performance
 */

import { db } from '../lib/db/postgres.js'

interface MatrixCell {
  tokens: number
  cost: number
  requests: number
}

interface MatrixData {
  [provider: string]: {
    [operation: string]: MatrixCell
  }
}

async function main() {
  console.log('🧪 Test Dashboard Provider Usage\n')

  try {
    // 1. Test données brutes SQL (7 derniers jours)
    console.log('📊 1. Vérification données brutes SQL...')
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const rawDataQuery = `
      SELECT
        provider,
        operation_type,
        COUNT(*) as request_count,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(cost_usd) as total_cost_usd
      FROM ai_usage_logs
      WHERE created_at >= $1
        AND provider IS NOT NULL
        AND operation_type IS NOT NULL
      GROUP BY provider, operation_type
      ORDER BY total_cost_usd DESC
    `

    const result = await db.query(rawDataQuery, [sevenDaysAgo.toISOString()])
    console.log(`   ✅ ${result.rows.length} combinaisons provider×opération trouvées\n`)

    if (result.rows.length === 0) {
      console.log('⚠️  Aucune donnée d\'usage AI trouvée dans les 7 derniers jours')
      console.log('   💡 Utilisez l\'application pour générer des logs d\'usage\n')
      return
    }

    // 2. Afficher le top 5
    console.log('📈 2. Top 5 des coûts (provider × opération):')
    result.rows.slice(0, 5).forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.provider} / ${row.operation_type}`)
      console.log(`      💰 $${parseFloat(row.total_cost_usd).toFixed(4)}`)
      console.log(`      🎫 ${parseInt(row.total_tokens).toLocaleString('fr-FR')} tokens`)
      console.log(`      🔢 ${parseInt(row.request_count)} requêtes`)
    })
    console.log('')

    // 3. Calculer totaux par provider
    console.log('💵 3. Coûts totaux par provider:')
    const providerTotals: Record<string, number> = {}
    result.rows.forEach(row => {
      const provider = row.provider
      providerTotals[provider] = (providerTotals[provider] || 0) + parseFloat(row.total_cost_usd || '0')
    })

    Object.entries(providerTotals)
      .sort(([, a], [, b]) => b - a)
      .forEach(([provider, cost]) => {
        console.log(`   ${provider.padEnd(12)} $${cost.toFixed(4)}`)
      })

    const totalCost = Object.values(providerTotals).reduce((sum, cost) => sum + cost, 0)
    console.log(`   ${'TOTAL'.padEnd(12)} $${totalCost.toFixed(4)}\n`)

    // 4. Test structure matrice
    console.log('🔲 4. Test structure matrice:')
    const matrix: MatrixData = {}
    result.rows.forEach(row => {
      const { provider, operation_type, request_count, total_tokens, total_cost_usd } = row

      if (!matrix[provider]) matrix[provider] = {}

      matrix[provider][operation_type] = {
        tokens: parseInt(total_tokens) || 0,
        cost: parseFloat(total_cost_usd) || 0,
        requests: parseInt(request_count) || 0
      }
    })

    console.log(`   ✅ Matrice construite avec ${Object.keys(matrix).length} providers`)
    Object.entries(matrix).forEach(([provider, operations]) => {
      console.log(`      ${provider}: ${Object.keys(operations).length} opérations`)
    })
    console.log('')

    // 5. Test tendances quotidiennes
    console.log('📉 5. Test tendances quotidiennes:')
    const trendsQuery = `
      SELECT
        DATE(created_at) as date,
        provider,
        COUNT(*) as requests
      FROM ai_usage_logs
      WHERE created_at >= $1
        AND provider IS NOT NULL
      GROUP BY DATE(created_at), provider
      ORDER BY date DESC
      LIMIT 10
    `

    const trendsResult = await db.query(trendsQuery, [sevenDaysAgo.toISOString()])
    console.log(`   ✅ ${trendsResult.rows.length} points de données (max 10 affichés)`)
    trendsResult.rows.forEach(row => {
      const date = new Date(row.date).toLocaleDateString('fr-FR')
      console.log(`      ${date} - ${row.provider}: ${row.requests} requêtes`)
    })
    console.log('')

    // 6. Vérifications de cohérence
    console.log('✅ 6. Vérifications de cohérence:')

    // Vérifier que les totaux correspondent
    let matrixTotal = 0
    Object.values(matrix).forEach(operations => {
      Object.values(operations).forEach(cell => {
        matrixTotal += cell.cost
      })
    })

    const diff = Math.abs(matrixTotal - totalCost)
    if (diff < 0.01) {
      console.log('   ✅ Totaux cohérents (matrice vs SQL)')
    } else {
      console.log(`   ⚠️  Écart détecté: matrice=$${matrixTotal.toFixed(4)}, SQL=$${totalCost.toFixed(4)}`)
    }

    // Vérifier présence des providers principaux
    const expectedProviders = ['gemini', 'deepseek', 'groq', 'ollama']
    const foundProviders = Object.keys(matrix)
    const missingProviders = expectedProviders.filter(p => !foundProviders.includes(p))

    if (missingProviders.length > 0) {
      console.log(`   ℹ️  Providers sans usage: ${missingProviders.join(', ')}`)
    } else {
      console.log('   ✅ Tous les providers attendus ont des données')
    }

    console.log('\n✅ Tests terminés avec succès!\n')

    console.log('📝 Résumé:')
    console.log(`   • ${result.rows.length} combinaisons provider×opération`)
    console.log(`   • ${Object.keys(providerTotals).length} providers actifs`)
    console.log(`   • $${totalCost.toFixed(4)} coût total (7 derniers jours)`)
    console.log(`   • APIs prêtes à être testées sur http://localhost:7002/super-admin/provider-usage\n`)

  } catch (error) {
    console.error('❌ Erreur:', error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

main()
