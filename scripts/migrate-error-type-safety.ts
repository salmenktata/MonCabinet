#!/usr/bin/env tsx
/**
 * Migration Type Safety - error: any → getErrorMessage()
 *
 * Phase 4.4 - Migration progressive par priorité
 *
 * Priorité 1: API Routes critiques (monitoring, auth, admin)
 * Priorité 2: Services core (alerts, sync, scraper)
 * Priorité 3: Actions & Components
 * Priorité 4: Scripts (dev-only)
 */

/**
 * Fichiers à migrer par priorité
 */
const MIGRATION_PRIORITIES = {
  /**
   * Priorité 1 - API Routes Critiques (15 fichiers)
   * Impact: Production, utilisateurs, monitoring
   */
  priority1: [
    // Monitoring & Alertes
    'app/api/admin/monitor-openai/route.ts',
    'app/api/admin/alerts/check/route.ts',
    'app/api/admin/monitoring/metrics/route.ts',
    'app/api/admin/monitoring/rag-health/route.ts',
    'app/api/admin/monitoring/crons/start/route.ts',
    'app/api/admin/monitoring/crons/complete/route.ts',

    // KB Quality
    'app/api/admin/kb/analyze-quality/route.ts',
    'app/api/admin/kb/reanalyze/route.ts',
    'app/api/admin/kb/reanalyze-failed/route.ts',
    'app/api/admin/kb/reanalyze-all/route.ts',

    // Auth (sécurité critique)
    'app/api/auth/register/route.ts',
    'app/api/auth/forgot-password/route.ts',
    'app/api/auth/reset-password/route.ts',
    'app/api/auth/change-password/route.ts',
    'app/api/auth/verify-email/route.ts',
  ],

  /**
   * Priorité 2 - Services Core (10 fichiers)
   * Impact: Fonctionnalités essentielles
   */
  priority2: [
    // Services
    'lib/alerts/email-alert-service.ts',
    'lib/integrations/sync-service.ts',
    'lib/web-scraper/gdrive-utils.ts',
    'lib/web-scraper/file-parser-service.ts',
    'lib/web-scraper/gdrive-crawler-service.ts',
    'lib/integrations/cloud-storage/google-drive.ts',

    // API Routes Admin
    'app/api/admin/cron-executions/stats/route.ts',
    'app/api/admin/cron-executions/trigger/route.ts',
    'app/api/admin/batches/pause/route.ts',
    'app/api/admin/batches/resume/route.ts',
  ],

  /**
   * Priorité 3 - Actions & Components (10 fichiers)
   * Impact: UX, formulaires
   */
  priority3: [
    // Actions
    'app/actions/auth.ts',
    'app/actions/profile.ts',
    'app/actions/documents.ts',
    'app/actions/cloud-storage.ts',

    // Components
    'components/super-admin/monitoring/BatchesStatusSection.tsx',
    'components/super-admin/monitoring/ScheduledCronsSection.tsx',
    'components/parametres/NotificationPreferencesForm.tsx',
    'components/profile/ProfileForm.tsx',

    // Pages
    'app/(auth)/reset-password/page.tsx',
  ],

  /**
   * Priorité 4 - Scripts (reste, ~70 fichiers)
   * Impact: Dev uniquement, moins critique
   */
  priority4: [
    // Note: Tous les scripts/**.ts restants
    // Migration optionnelle, faible priorité
  ],
}

/**
 * Pattern de remplacement
 */
function migrateFile(content: string): { content: string; changes: number } {
  let changes = 0

  // 1. Remplacer catch (error: any) → catch (error)
  content = content.replace(/catch\s*\(\s*error:\s*any\s*\)/g, () => {
    changes++
    return 'catch (error)'
  })

  // 2. Ajouter import getErrorMessage si nécessaire
  if (changes > 0 && !content.includes("from '@/lib/utils/error-utils'")) {
    // Trouver la dernière ligne d'import
    const importLines = content.split('\n').filter(line => line.trim().startsWith('import '))
    if (importLines.length > 0) {
      const lastImport = importLines[importLines.length - 1]
      const importIndex = content.indexOf(lastImport) + lastImport.length

      content =
        content.slice(0, importIndex) +
        "\nimport { getErrorMessage } from '@/lib/utils/error-utils'" +
        content.slice(importIndex)
    }
  }

  return { content, changes }
}

/**
 * Rapport de migration
 */
function printMigrationPlan() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║          PLAN MIGRATION TYPE SAFETY - error: any             ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()

  console.log('📋 Fichiers par priorité:')
  console.log()

  console.log('🔴 PRIORITÉ 1 - API Routes Critiques')
  console.log(`   ${MIGRATION_PRIORITIES.priority1.length} fichiers`)
  console.log('   Impact: Production, monitoring, auth')
  console.log('   Effort: ~2h')
  console.log()

  console.log('🟠 PRIORITÉ 2 - Services Core')
  console.log(`   ${MIGRATION_PRIORITIES.priority2.length} fichiers`)
  console.log('   Impact: Fonctionnalités essentielles')
  console.log('   Effort: ~1h')
  console.log()

  console.log('🟡 PRIORITÉ 3 - Actions & Components')
  console.log(`   ${MIGRATION_PRIORITIES.priority3.length} fichiers`)
  console.log('   Impact: UX, formulaires')
  console.log('   Effort: ~30min')
  console.log()

  console.log('🟢 PRIORITÉ 4 - Scripts')
  console.log('   ~70 fichiers restants')
  console.log('   Impact: Dev uniquement')
  console.log('   Effort: Optionnel')
  console.log()

  const total =
    MIGRATION_PRIORITIES.priority1.length +
    MIGRATION_PRIORITIES.priority2.length +
    MIGRATION_PRIORITIES.priority3.length

  console.log(`📊 Total priorités 1-3: ${total} fichiers`)
  console.log('⏱️  Effort total estimé: 3h30min')
  console.log()

  console.log('🎯 Pattern de remplacement:')
  console.log('   catch (error: any) → catch (error)')
  console.log("   + import { getErrorMessage } from '@/lib/utils/error-utils'")
  console.log()

  console.log('⚡ Commande de migration manuelle:')
  console.log('   Utiliser outil Edit pour chaque fichier')
  console.log('   (Script automatique a bug insertion imports)')
  console.log()
}

// Exécution
if (require.main === module) {
  printMigrationPlan()

  console.log('📝 Prochaines étapes:')
  console.log('1. Migrer PRIORITÉ 1 (15 fichiers API critiques)')
  console.log('2. Test build + validation')
  console.log('3. Commit "fix(type-safety): migrate priority 1 API routes"')
  console.log('4. Continuer PRIORITÉ 2-3')
  console.log()
}
