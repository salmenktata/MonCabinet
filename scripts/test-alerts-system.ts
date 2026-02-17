#!/usr/bin/env tsx
/**
 * Test du système d'alertes email
 *
 * Usage:
 *   npm run test:alerts
 *   npx tsx scripts/test-alerts-system.ts
 *
 * Teste :
 * - Connexion PostgreSQL
 * - Récupération métriques
 * - Détection alertes
 * - Envoi email (si BREVO_API_KEY configuré)
 */

import { checkAndSendAlerts } from '../lib/alerts/email-alert-service'

async function main() {
  console.log('═'.repeat(60))
  console.log('  🧪 Test Système d\'Alertes Email')
  console.log('═'.repeat(60))
  console.log()

  // Vérifier variables d'environnement
  console.log('📋 Configuration:')
  console.log(`   BREVO_API_KEY: ${process.env.BREVO_API_KEY ? '✅ Configuré' : '❌ Manquant'}`)
  console.log(`   ALERT_EMAIL: ${process.env.ALERT_EMAIL || 'admin@qadhya.tn (défaut)'}`)
  console.log(`   CRON_SECRET: ${process.env.CRON_SECRET ? '✅ Configuré' : '❌ Manquant'}`)
  console.log()

  if (!process.env.BREVO_API_KEY) {
    console.log('⚠️  BREVO_API_KEY non configuré - Emails ne seront pas envoyés')
    console.log('   Pour tester l\'envoi d\'emails:')
    console.log('   1. Créer un compte sur https://www.brevo.com')
    console.log('   2. Récupérer la clé API')
    console.log('   3. Ajouter BREVO_API_KEY dans .env.local')
    console.log()
  }

  // Démarrer test
  console.log('🚀 Démarrage vérification alertes...')
  console.log()

  const startTime = Date.now()

  try {
    const result = await checkAndSendAlerts()

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log('─'.repeat(60))
    console.log('📊 Résultat:')
    console.log(`   Succès: ${result.success ? '✅' : '❌'}`)
    console.log(`   Alertes détectées: ${result.alertsDetected}`)
    console.log(`   Emails envoyés: ${result.alertsSent}`)
    console.log(`   Durée: ${duration}s`)
    console.log('─'.repeat(60))
    console.log()

    if (result.alerts.length > 0) {
      console.log('🚨 Détails des alertes:')
      console.log()

      result.alerts.forEach((alert, idx) => {
        const emoji = alert.level === 'critical' ? '🚨' : '⚠️'
        console.log(`${idx + 1}. ${emoji} [${alert.level.toUpperCase()}] ${alert.title}`)
        console.log(`   Message: ${alert.message}`)

        if (Object.keys(alert.metrics).length > 0) {
          console.log(`   Métriques:`)
          if (alert.metrics.budgetUsed) {
            console.log(`     • Budget utilisé: ${alert.metrics.budgetUsed.toFixed(1)}%`)
          }
          if (alert.metrics.budgetRemaining !== undefined) {
            console.log(`     • Budget restant: $${alert.metrics.budgetRemaining.toFixed(2)}`)
          }
          if (alert.metrics.failures) {
            console.log(`     • Échecs: ${alert.metrics.failures}`)
          }
          if (alert.metrics.errorRate) {
            console.log(`     • Taux d'erreur: ${alert.metrics.errorRate.toFixed(1)}%`)
          }
        }

        console.log(`   Recommendations:`)
        alert.recommendations.forEach(rec => {
          console.log(`     • ${rec}`)
        })
        console.log()
      })
    } else {
      console.log('✅ Aucune alerte détectée - Système normal')
      console.log()
    }

    // Summary
    console.log('═'.repeat(60))
    if (result.success) {
      console.log('✅ Test terminé avec succès')
      if (result.alertsSent > 0) {
        console.log(`   ${result.alertsSent} email(s) envoyé(s) à ${process.env.ALERT_EMAIL || 'admin@qadhya.tn'}`)
        console.log('   Vérifiez votre boîte email')
      } else if (result.alertsDetected > 0) {
        console.log('   Alertes détectées mais emails déjà envoyés récemment (cache 6h)')
        console.log('   Pour forcer un nouvel envoi, vider le cache Redis:')
        console.log('   docker exec qadhya-redis redis-cli FLUSHDB')
      }
    } else {
      console.log('❌ Test échoué')
    }
    console.log('═'.repeat(60))

  } catch (error) {
    console.error('❌ Erreur:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main().catch(console.error)
