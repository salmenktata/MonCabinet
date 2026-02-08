#!/usr/bin/env tsx
/**
 * Script de cycle d'apprentissage automatique
 * À exécuter quotidiennement via cron job
 *
 * Usage:
 *   npx tsx scripts/run-learning-cycle.ts
 *   ou
 *   node --loader ts-node/esm scripts/run-learning-cycle.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Charger les variables d'environnement
config({ path: resolve(process.cwd(), '.env') })

import { db } from '@/lib/db/postgres'
import { runLearningCycle, getLearningStats } from '@/lib/web-scraper/classification-learning-service'
import { getClassificationStats } from '@/lib/web-scraper/legal-classifier-service'

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🤖 CYCLE D\'APPRENTISSAGE AUTOMATIQUE')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`⏰ Démarré à: ${new Date().toLocaleString('fr-TN')}`)
  console.log('')

  try {
    // Statistiques avant apprentissage
    console.log('📊 Statistiques AVANT apprentissage:')
    const statsBefore = await getLearningStats()
    console.log(`   • Total corrections: ${statsBefore.totalCorrections}`)
    console.log(`   • Corrections non utilisées: ${statsBefore.unusedCorrections}`)
    console.log(`   • Règles générées: ${statsBefore.rulesGenerated}`)
    console.log(`   • Suggestions taxonomie: ${statsBefore.taxonomySuggestions}`)
    console.log(`   • Précision moyenne: ${(statsBefore.avgAccuracyImprovement * 100).toFixed(1)}%`)
    console.log('')

    // Statistiques de classification
    const classificationStats = await getClassificationStats()
    console.log('📈 Statistiques de classification:')
    console.log(`   • Total pages classées: ${classificationStats.total}`)
    console.log(`   • Confiance moyenne: ${(classificationStats.avgConfidence * 100).toFixed(1)}%`)
    console.log(`   • En attente de validation: ${classificationStats.pendingValidation}`)
    console.log('')

    // Exécuter le cycle d'apprentissage
    console.log('🔄 Exécution du cycle d\'apprentissage...')
    const startTime = Date.now()

    const result = await runLearningCycle()

    const duration = Date.now() - startTime
    console.log('')

    // Résultats
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ CYCLE TERMINÉ')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`⏱️  Durée: ${duration}ms`)
    console.log(`🎯 Règles générées: ${result.rulesGenerated}`)
    console.log(`🏷️  Suggestions taxonomie: ${result.taxonomySuggestions}`)
    console.log(`⚠️  Règles à revoir: ${result.rulesReviewed}`)
    console.log('')

    // Statistiques après apprentissage
    const statsAfter = await getLearningStats()
    const improvement = statsAfter.rulesGenerated - statsBefore.rulesGenerated

    if (improvement > 0) {
      console.log(`📈 Amélioration: +${improvement} règle(s) générée(s)`)
    }

    // Recommandations
    if (result.rulesReviewed > 0) {
      console.log('')
      console.log('💡 RECOMMANDATIONS:')
      console.log(`   ⚠️  ${result.rulesReviewed} règle(s) nécessitent une revue manuelle`)
      console.log('   👉 Utilisez le dashboard Super Admin > Classification > Règles')
    }

    if (statsAfter.unusedCorrections > 50) {
      console.log(`   ⚠️  ${statsAfter.unusedCorrections} corrections non utilisées`)
      console.log('   👉 Validez quelques pages pour améliorer le système')
    }

    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`✅ Terminé à: ${new Date().toLocaleString('fr-TN')}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    process.exit(0)
  } catch (error) {
    console.error('')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('❌ ERREUR')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error(error)
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    process.exit(1)
  } finally {
    await db.closePool()
  }
}

main()
