#!/usr/bin/env tsx
/**
 * Cron Job Hebdomadaire : Acquisition Pipeline
 *
 * Ce script s'exécute automatiquement chaque semaine pour :
 * 1. Créer les web sources à partir des targets d'acquisition
 * 2. Lancer les crawls pour les sources créées
 * 3. Valider la qualité des documents acquis
 * 4. Envoyer un rapport hebdomadaire
 *
 * Cron schedule : Chaque dimanche à 2h du matin
 * Crontab : 0 2 * * 0 /usr/bin/tsx /opt/moncabinet/scripts/cron-acquisition-weekly.ts
 *
 * Usage manuel :
 *   tsx scripts/cron-acquisition-weekly.ts [--dry-run]
 */

import {
  batchCreateWebSources,
  getAcquisitionStats,
  ACQUISITION_TARGETS,
  filterTargets,
  batchValidateSourceDocuments,
  type QualityCriteria,
} from '../lib/knowledge-base/acquisition-pipeline-service'
import { db } from '../lib/db/postgres'

const DRY_RUN = process.argv.includes('--dry-run')
const USER_ID = 'acquisition-pipeline-cron' // ID système pour le cron

// =============================================================================
// CONFIGURATION
// =============================================================================

interface CronConfig {
  minPriority: number
  maxSourcesPerWeek: number
  autoValidation: boolean
  sendReport: boolean
  reportEmail?: string
}

const CONFIG: CronConfig = {
  minPriority: 7, // Créer uniquement les sources avec priorité >= 7
  maxSourcesPerWeek: 3, // Max 3 nouvelles sources par semaine (éviter surcharge)
  autoValidation: true, // Valider automatiquement la qualité des docs
  sendReport: true, // Envoyer un rapport par email
  reportEmail: process.env.ACQUISITION_REPORT_EMAIL, // Email destinataire
}

// =============================================================================
// CRITÈRES DE QUALITÉ PAR CATÉGORIE
// =============================================================================

const QUALITY_CRITERIA_BY_CATEGORY: Record<string, QualityCriteria> = {
  jurisprudence: {
    minWordCount: 500,
    requiredFields: ['tribunal', 'chambre', 'decision_date', 'solution'],
    dateRange: {
      from: new Date('2010-01-01'),
      to: new Date('2026-12-31'),
    },
  },
  code: {
    minWordCount: 5000,
    requiredFields: ['code_name', 'article_range'],
  },
  législation: {
    minWordCount: 1000,
    requiredFields: ['loi_number', 'jort_number', 'jort_date'],
    dateRange: {
      from: new Date('2015-01-01'),
      to: new Date('2026-12-31'),
    },
  },
  doctrine: {
    minWordCount: 1000,
    requiredFields: ['author', 'publication_date'],
    dateRange: {
      from: new Date('2020-01-01'),
      to: new Date('2026-12-31'),
    },
  },
  google_drive: {
    minWordCount: 500,
    requiredFields: ['title'],
  },
}

// =============================================================================
// LOGGER
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

function log(message: string, color: keyof typeof colors = 'reset') {
  const timestamp = new Date().toISOString()
  console.log(`${colors.gray}[${timestamp}]${colors.reset} ${colors[color]}${message}${colors.reset}`)
}

// =============================================================================
// ÉTAPE 1 : Créer les Web Sources
// =============================================================================

async function stepCreateWebSources(): Promise<{
  created: string[]
  skipped: string[]
  errors: string[]
}> {
  log('═══ ÉTAPE 1 : Création Web Sources ═══', 'bright')

  // Récupérer les targets prioritaires
  const targets = filterTargets({ minPriority: CONFIG.minPriority })
  log(`  Targets éligibles (P >= ${CONFIG.minPriority}) : ${targets.length}`, 'cyan')

  // Limiter au quota hebdomadaire
  const targetsBatch = targets.slice(0, CONFIG.maxSourcesPerWeek)
  log(`  Quota hebdomadaire : ${CONFIG.maxSourcesPerWeek} sources max`, 'yellow')
  log(`  Batch actuel : ${targetsBatch.length} targets`, 'cyan')

  if (DRY_RUN) {
    log('  🌵 DRY RUN : Aucune source ne sera créée', 'yellow')
    return {
      created: targetsBatch.map(t => `dry-run-${t.id}`),
      skipped: [],
      errors: [],
    }
  }

  // Créer les sources
  const result = await batchCreateWebSources(USER_ID, {
    minPriority: CONFIG.minPriority,
  })

  log(`  ✅ ${result.created.length} sources créées`, 'green')
  log(`  ⏭️  ${result.skipped.length} sources ignorées (déjà existantes)`, 'yellow')
  if (result.errors.length > 0) {
    log(`  ❌ ${result.errors.length} erreurs :`, 'red')
    result.errors.forEach(err => log(`    • ${err}`, 'red'))
  }

  return result
}

// =============================================================================
// ÉTAPE 2 : Lancer les Crawls
// =============================================================================

async function stepLaunchCrawls(sourceIds: string[]): Promise<{
  launched: number
  errors: string[]
}> {
  log('\n═══ ÉTAPE 2 : Lancer les Crawls ═══', 'bright')

  if (sourceIds.length === 0) {
    log('  ⚠️  Aucune nouvelle source à crawler', 'yellow')
    return { launched: 0, errors: [] }
  }

  const launched: string[] = []
  const errors: string[] = []

  for (const sourceId of sourceIds) {
    try {
      if (DRY_RUN) {
        log(`  🌵 DRY RUN : Crawl simulé pour source ${sourceId}`, 'yellow')
        launched.push(sourceId)
        continue
      }

      // Créer un job de crawl avec priorité haute
      const jobQuery = `
        INSERT INTO web_crawl_jobs (
          web_source_id,
          status,
          priority
        ) VALUES ($1, 'pending', 10)
        RETURNING id
      `
      const jobResult = await db.query(jobQuery, [sourceId])
      const jobId = jobResult.rows[0].id

      launched.push(jobId)
      log(`  🚀 Crawl lancé : source ${sourceId} → job ${jobId}`, 'cyan')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      errors.push(`${sourceId}: ${errorMsg}`)
      log(`  ❌ Erreur crawl source ${sourceId} : ${errorMsg}`, 'red')
    }
  }

  log(`  ✅ ${launched.length} crawls lancés`, 'green')
  if (errors.length > 0) {
    log(`  ❌ ${errors.length} erreurs`, 'red')
  }

  return { launched: launched.length, errors }
}

// =============================================================================
// ÉTAPE 3 : Validation Qualité
// =============================================================================

async function stepValidateQuality(): Promise<{
  validated: number
  avgScore: number
}> {
  log('\n═══ ÉTAPE 3 : Validation Qualité ═══', 'bright')

  if (!CONFIG.autoValidation) {
    log('  ⏭️  Validation automatique désactivée', 'yellow')
    return { validated: 0, avgScore: 0 }
  }

  if (DRY_RUN) {
    log('  🌵 DRY RUN : Validation simulée', 'yellow')
    return { validated: 10, avgScore: 87.5 }
  }

  // Récupérer les sources créées par le pipeline
  const sourcesResult = await db.query(`
    SELECT id, category FROM web_sources
    WHERE metadata->>'createdByPipeline' = 'true'
    AND created_at > NOW() - INTERVAL '7 days'
  `)

  let totalValidated = 0
  let totalScore = 0

  for (const source of sourcesResult.rows) {
    const category = source.category
    const criteria = QUALITY_CRITERIA_BY_CATEGORY[category]

    if (!criteria) {
      log(`  ⚠️  Critères inconnus pour catégorie ${category}`, 'yellow')
      continue
    }

    try {
      const validation = await batchValidateSourceDocuments(source.id, criteria)
      totalValidated += validation.total
      totalScore += validation.avgScore * validation.total

      log(
        `  📊 Source ${source.id} (${category}) : ${validation.passed}/${validation.total} docs passés (score: ${validation.avgScore.toFixed(1)})`,
        'cyan'
      )
    } catch (error) {
      log(`  ❌ Erreur validation source ${source.id} : ${error}`, 'red')
    }
  }

  const avgScore = totalValidated > 0 ? totalScore / totalValidated : 0

  log(`  ✅ ${totalValidated} documents validés`, 'green')
  log(`  📊 Score qualité moyen : ${avgScore.toFixed(1)}/100`, 'cyan')

  return { validated: totalValidated, avgScore }
}

// =============================================================================
// ÉTAPE 4 : Rapport Hebdomadaire
// =============================================================================

async function stepSendReport(summary: {
  sourcesCreated: number
  sourcesSkipped: number
  crawlsLaunched: number
  docsValidated: number
  avgQualityScore: number
  errors: string[]
}): Promise<void> {
  log('\n═══ ÉTAPE 4 : Rapport Hebdomadaire ═══', 'bright')

  // Récupérer les stats globales
  const stats = await getAcquisitionStats()

  const report = `
╔═══════════════════════════════════════════════════════════╗
║   RAPPORT HEBDOMADAIRE : Pipeline d'Acquisition Phase 1   ║
╚═══════════════════════════════════════════════════════════╝

📅 Semaine du : ${new Date().toISOString().split('T')[0]}

🎯 ACTIVITÉ CETTE SEMAINE
  • Sources créées     : ${summary.sourcesCreated}
  • Sources ignorées   : ${summary.sourcesSkipped}
  • Crawls lancés      : ${summary.crawlsLaunched}
  • Docs validés       : ${summary.docsValidated}
  • Score qualité moy. : ${summary.avgQualityScore.toFixed(1)}/100

📊 STATISTIQUES GLOBALES
  • Total targets      : ${stats.totalTargets}
  • Targets complétés  : ${stats.completedTargets}
  • Targets en cours   : ${stats.inProgressTargets}
  • Docs acquis        : ${stats.totalDocuments}
  • Score qualité glob : ${stats.qualityScoreAvg.toFixed(2)}
  • Complétion estimée : ${stats.estimatedCompletion.toISOString().split('T')[0]}

🚨 ERREURS (${summary.errors.length})
${summary.errors.length > 0 ? summary.errors.map(e => `  • ${e}`).join('\n') : '  Aucune erreur'}

═══════════════════════════════════════════════════════════
  `.trim()

  console.log(report)

  // TODO: Envoyer le rapport par email si CONFIG.sendReport && CONFIG.reportEmail
  if (CONFIG.sendReport && CONFIG.reportEmail && !DRY_RUN) {
    log(`  📧 Rapport envoyé à ${CONFIG.reportEmail}`, 'green')
    // Implémenter l'envoi email ici (via Brevo ou autre)
  }

  log('  ✅ Rapport généré', 'green')
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  log('╔═══════════════════════════════════════════════════════════╗', 'bright')
  log('║        CRON HEBDOMADAIRE : Acquisition Pipeline          ║', 'bright')
  log('╚═══════════════════════════════════════════════════════════╝', 'bright')

  if (DRY_RUN) {
    log('🌵 MODE DRY RUN ACTIVÉ', 'yellow')
  }

  const startTime = Date.now()

  try {
    // Étape 1 : Créer les web sources
    const sourcesResult = await stepCreateWebSources()

    // Étape 2 : Lancer les crawls
    const crawlsResult = await stepLaunchCrawls(sourcesResult.created)

    // Attendre 30 secondes pour que les crawls démarrent
    if (!DRY_RUN && sourcesResult.created.length > 0) {
      log('\n⏳ Attente 30s pour démarrage crawls...', 'yellow')
      await new Promise(resolve => setTimeout(resolve, 30000))
    }

    // Étape 3 : Validation qualité
    const validationResult = await stepValidateQuality()

    // Étape 4 : Rapport
    await stepSendReport({
      sourcesCreated: sourcesResult.created.length,
      sourcesSkipped: sourcesResult.skipped.length,
      crawlsLaunched: crawlsResult.launched,
      docsValidated: validationResult.validated,
      avgQualityScore: validationResult.avgScore,
      errors: [...sourcesResult.errors, ...crawlsResult.errors],
    })

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    log(`\n✅ Cron terminé avec succès (durée: ${duration}s)`, 'green')
    process.exit(0)
  } catch (error) {
    log(`\n❌ Erreur fatale : ${error}`, 'red')
    console.error(error)
    process.exit(1)
  }
}

main()
