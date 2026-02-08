/**
 * Planificateur de tâches pour l'apprentissage automatique
 * Utilise node-cron pour exécuter des tâches périodiques
 */

import cron from 'node-cron'
import { runLearningCycle, getLearningStats } from '@/lib/web-scraper/classification-learning-service'

// =============================================================================
// CONFIGURATION
// =============================================================================

const LEARNING_CYCLE_SCHEDULE = process.env.LEARNING_CYCLE_CRON || '0 2 * * *' // 2h du matin par défaut

// =============================================================================
// TÂCHES
// =============================================================================

/**
 * Tâche quotidienne d'apprentissage
 * Exécutée tous les jours à 2h du matin par défaut
 */
export function scheduleLearningCycle() {
  console.log('[Cron] Planification du cycle d\'apprentissage:', LEARNING_CYCLE_SCHEDULE)

  const task = cron.schedule(
    LEARNING_CYCLE_SCHEDULE,
    async () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🤖 [Cron] Démarrage du cycle d\'apprentissage automatique')
      console.log(`⏰ ${new Date().toLocaleString('fr-TN')}`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

      try {
        const startTime = Date.now()

        // Statistiques avant
        const statsBefore = await getLearningStats()
        console.log('📊 Avant:', {
          corrections: statsBefore.totalCorrections,
          règles: statsBefore.rulesGenerated,
        })

        // Exécution
        const result = await runLearningCycle()

        const duration = Date.now() - startTime

        // Résultats
        console.log('✅ Cycle terminé en', duration, 'ms')
        console.log('   Règles générées:', result.rulesGenerated)
        console.log('   Suggestions taxonomie:', result.taxonomySuggestions)
        console.log('   Règles à revoir:', result.rulesReviewed)

        // Statistiques après
        const statsAfter = await getLearningStats()
        const improvement = statsAfter.rulesGenerated - statsBefore.rulesGenerated

        if (improvement > 0) {
          console.log(`📈 Amélioration: +${improvement} règle(s)`)
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      } catch (error) {
        console.error('❌ [Cron] Erreur lors du cycle d\'apprentissage:')
        console.error(error)
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      }
    },
    {
      scheduled: true,
      timezone: 'Africa/Tunis',
    }
  )

  return task
}

/**
 * Initialise tous les cron jobs
 */
export function initializeCronJobs() {
  if (process.env.DISABLE_CRON === 'true') {
    console.log('[Cron] Cron jobs désactivés (DISABLE_CRON=true)')
    return
  }

  console.log('[Cron] Initialisation des cron jobs...')

  // Cycle d'apprentissage quotidien
  const learningTask = scheduleLearningCycle()

  console.log('[Cron] ✅ Cron jobs initialisés')

  return {
    learningTask,
  }
}

/**
 * Arrête tous les cron jobs
 */
export function stopCronJobs(tasks: { learningTask: cron.ScheduledTask }) {
  console.log('[Cron] Arrêt des cron jobs...')

  if (tasks.learningTask) {
    tasks.learningTask.stop()
  }

  console.log('[Cron] ✅ Cron jobs arrêtés')
}
