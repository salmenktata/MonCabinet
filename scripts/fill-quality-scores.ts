#!/usr/bin/env tsx
/**
 * Script pour remplir les quality_scores manquants en boucle
 *
 * Appelle POST /api/admin/kb/analyze-quality en boucle jusqu'à ce que
 * withoutScore === 0 (ou que maxBatches soit atteint).
 *
 * Usage:
 *   npx tsx scripts/fill-quality-scores.ts
 *   npx tsx scripts/fill-quality-scores.ts --category=jurisprudence
 *   npx tsx scripts/fill-quality-scores.ts --source-url=cassation.tn
 *   npx tsx scripts/fill-quality-scores.ts --max-batches=200 --batch-size=50
 *
 * Options:
 *   --category=<cat>       Filtrer par catégorie KB
 *   --source-url=<url>     Filtrer par URL de source web (ex: cassation.tn)
 *   --max-batches=<n>      Nombre maximum de batches (défaut: 100)
 *   --batch-size=<n>       Nombre de docs par batch (défaut: 50)
 *   --pause=<ms>           Pause entre batches en ms (défaut: 5000)
 *   --base-url=<url>       URL de base de l'API (défaut: http://localhost:7002)
 */

import 'dotenv/config'

// =============================================================================
// PARAMÈTRES CLI
// =============================================================================

const args = process.argv.slice(2)

const category = args.find(a => a.startsWith('--category='))?.split('=')[1] || null
const sourceUrl = args.find(a => a.startsWith('--source-url='))?.split('=')[1] || null
const maxBatches = parseInt(args.find(a => a.startsWith('--max-batches='))?.split('=')[1] || '100', 10)
const batchSize = parseInt(args.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '50', 10)
const pauseMs = parseInt(args.find(a => a.startsWith('--pause='))?.split('=')[1] || '5000', 10)
const baseUrl = args.find(a => a.startsWith('--base-url='))?.split('=')[1] || 'http://localhost:7002'

// Clé CRON_SECRET depuis l'environnement
const cronSecret = process.env.CRON_SECRET
if (!cronSecret) {
  console.error('❌ CRON_SECRET manquant dans l\'environnement (.env.local)')
  process.exit(1)
}

// =============================================================================
// HELPERS
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface QualityStats {
  totalDocs: number
  withScore: number
  withoutScore: number
  avgScore: number
  coverage: number
}

async function getStats(): Promise<QualityStats | null> {
  try {
    const res = await fetch(`${baseUrl}/api/admin/kb/analyze-quality`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) {
      console.error(`❌ GET stats HTTP ${res.status}`)
      return null
    }
    const data = await res.json()
    return data.stats as QualityStats
  } catch (err) {
    console.error('❌ Erreur GET stats:', err)
    return null
  }
}

interface BatchResult {
  success: boolean
  analyzed: number
  succeeded: number
  failed: number
  message?: string
}

async function runBatch(): Promise<BatchResult | null> {
  try {
    const body: Record<string, unknown> = {
      batchSize,
      skipAnalyzed: true,
    }
    if (category) body.category = category
    if (sourceUrl) body.sourceUrl = sourceUrl

    const res = await fetch(`${baseUrl}/api/admin/kb/analyze-quality`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`❌ POST batch HTTP ${res.status}: ${text.slice(0, 200)}`)
      return null
    }

    const data = await res.json()
    return {
      success: data.success,
      analyzed: data.analyzed,
      succeeded: data.succeeded,
      failed: data.failed,
      message: data.message,
    }
  } catch (err) {
    console.error('❌ Erreur POST batch:', err)
    return null
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('🔍 Fill Quality Scores — Démarrage')
  console.log('Paramètres:', { category, sourceUrl, maxBatches, batchSize, pauseMs, baseUrl })
  console.log()

  // Stats initiales
  const initialStats = await getStats()
  if (!initialStats) {
    console.error('Impossible d\'obtenir les stats initiales. Vérifiez que le serveur est démarré.')
    process.exit(1)
  }

  console.log(`📊 État initial: ${initialStats.withScore}/${initialStats.totalDocs} docs avec score (${initialStats.coverage}% couverture)`)
  console.log(`   → ${initialStats.withoutScore} docs sans score à traiter\n`)

  if (initialStats.withoutScore === 0) {
    console.log('✅ Tous les documents ont déjà un quality_score. Rien à faire.')
    process.exit(0)
  }

  let batchNum = 0
  let totalAnalyzed = 0
  let totalSucceeded = 0
  let totalFailed = 0

  while (batchNum < maxBatches) {
    batchNum++
    console.log(`\n[Batch ${batchNum}/${maxBatches}] Lancement...`)

    const result = await runBatch()

    if (!result) {
      console.error(`  ⚠️ Batch ${batchNum} échoué (erreur réseau). Pause avant retry...`)
      await sleep(pauseMs * 2)
      continue
    }

    if (result.analyzed === 0) {
      console.log(`  ✅ Plus aucun document sans score. Arrêt.`)
      break
    }

    totalAnalyzed += result.analyzed
    totalSucceeded += result.succeeded
    totalFailed += result.failed

    console.log(`  ✅ ${result.succeeded}/${result.analyzed} réussis, ${result.failed} échoués`)
    console.log(`     Cumul: ${totalSucceeded} réussis, ${totalFailed} échoués sur ${totalAnalyzed} analysés`)

    // Vérifier si withoutScore est tombé à 0
    if (batchNum % 5 === 0) {
      const stats = await getStats()
      if (stats) {
        console.log(`  📊 Couverture actuelle: ${stats.withScore}/${stats.totalDocs} (${stats.coverage}%)`)
        if (stats.withoutScore === 0) {
          console.log('  ✅ withoutScore = 0. Terminé !')
          break
        }
      }
    }

    if (batchNum < maxBatches) {
      process.stdout.write(`  ⏳ Pause ${pauseMs}ms...`)
      await sleep(pauseMs)
      process.stdout.write(' OK\n')
    }
  }

  // Stats finales
  console.log('\n' + '='.repeat(60))
  console.log('📊 Résumé final:')
  console.log(`   Batches exécutés : ${batchNum}`)
  console.log(`   Docs analysés    : ${totalAnalyzed}`)
  console.log(`   Succès           : ${totalSucceeded}`)
  console.log(`   Échecs           : ${totalFailed}`)

  const finalStats = await getStats()
  if (finalStats) {
    console.log(`   Couverture finale: ${finalStats.withScore}/${finalStats.totalDocs} (${finalStats.coverage}%)`)
    if (finalStats.withoutScore > 0) {
      console.log(`   ⚠️  ${finalStats.withoutScore} docs encore sans score`)
    } else {
      console.log('   ✅ Couverture 100% atteinte !')
    }
  }
}

main().catch(err => {
  console.error('Erreur fatale:', err)
  process.exit(1)
})
