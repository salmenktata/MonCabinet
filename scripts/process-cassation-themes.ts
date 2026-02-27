#!/usr/bin/env npx tsx
/**
 * Script batch : Création des legal_documents depuis cassation.tn (17 thèmes)
 *
 * Pour chaque thème cassation.tn :
 * 1. Crée (ou trouve) le legal_document correspondant
 * 2. Lie les web_pages ayant structured_data->>'theme' = themeCode
 * 3. Consolide le texte (stratégie 'collection')
 *
 * Prérequis : backfill-cassation-themes.ts doit avoir été exécuté pour que
 * les pages existantes aient structured_data.theme renseigné.
 *
 * Usage:
 *   npx tsx scripts/process-cassation-themes.ts --all              # Tous les thèmes
 *   npx tsx scripts/process-cassation-themes.ts --theme=TA         # Un seul thème
 *   npx tsx scripts/process-cassation-themes.ts --all --dry-run    # Aperçu
 *   npx tsx scripts/process-cassation-themes.ts --all --force      # Retraiter existants
 */

import { db } from '@/lib/db/postgres'
import {
  findOrCreateDocument,
  linkPageToDocument,
  getDocumentByCitationKey,
  updateConsolidationStatus,
} from '@/lib/legal-documents/document-service'
import { consolidateCollection } from '@/lib/legal-documents/content-consolidation-service'
import { CASSATION_DOCUMENT_DOMAINS } from '@/lib/legal-documents/cassation-document-domains'
import { CASSATION_THEMES } from '@/lib/web-scraper/typo3-csrf-utils'

// =============================================================================
// CLI PARSING
// =============================================================================

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = {
    all: args.includes('--all'),
    theme: '',
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
  }

  const themeIdx = args.indexOf('--theme')
  if (themeIdx !== -1 && args[themeIdx + 1]) {
    flags.theme = args[themeIdx + 1]
  }

  if (!flags.all && !flags.theme) {
    console.error('Usage:')
    console.error('  npx tsx scripts/process-cassation-themes.ts --all [--dry-run] [--force]')
    console.error('  npx tsx scripts/process-cassation-themes.ts --theme=TA [--dry-run]')
    console.error('')
    console.error(`Thèmes disponibles: ${Object.keys(CASSATION_THEMES).join(', ')}`)
    process.exit(1)
  }

  return flags
}

// =============================================================================
// DISCOVERY
// =============================================================================

interface ThemeInfo {
  themeCode: string
  citationKey: string
  nameFr: string
  nameAr: string
  pageCount: number
  hasDocument: boolean
}

async function getCassationSourceId(): Promise<string | null> {
  const result = await db.query<any>(
    `SELECT id FROM web_sources WHERE base_url ILIKE '%cassation.tn%' LIMIT 1`
  )
  return result.rows[0]?.id || null
}

async function discoverThemes(cassationSourceId: string): Promise<ThemeInfo[]> {
  const themes: ThemeInfo[] = []

  for (const [themeCode, def] of Object.entries(CASSATION_DOCUMENT_DOMAINS)) {
    const cassationTheme = CASSATION_THEMES[themeCode]

    // Compter les pages avec ce thème dans structured_data
    const countResult = await db.query<any>(
      `SELECT COUNT(*) as count
       FROM web_pages
       WHERE web_source_id = $1
         AND structured_data->>'theme' = $2
         AND status IN ('crawled', 'indexed')`,
      [cassationSourceId, themeCode]
    )

    const pageCount = parseInt(countResult.rows[0].count, 10)
    const existing = await getDocumentByCitationKey(def.citationKey)

    themes.push({
      themeCode,
      citationKey: def.citationKey,
      nameFr: cassationTheme?.fr || def.titleFr,
      nameAr: def.titleAr,
      pageCount,
      hasDocument: existing !== null,
    })
  }

  themes.sort((a, b) => b.pageCount - a.pageCount)
  return themes
}

// =============================================================================
// PROCESSING
// =============================================================================

interface ProcessResult {
  themeCode: string
  citationKey: string
  status: 'created' | 'skipped' | 'error'
  pagesLinked: number
  consolidatedLength: number
  error?: string
}

async function processTheme(
  themeCode: string,
  cassationSourceId: string,
  dryRun: boolean
): Promise<ProcessResult> {
  const def = CASSATION_DOCUMENT_DOMAINS[themeCode]
  if (!def) {
    return { themeCode, citationKey: themeCode, status: 'error', pagesLinked: 0, consolidatedLength: 0, error: `Thème "${themeCode}" non trouvé dans CASSATION_DOCUMENT_DOMAINS` }
  }

  const result: ProcessResult = {
    themeCode,
    citationKey: def.citationKey,
    status: 'created',
    pagesLinked: 0,
    consolidatedLength: 0,
  }

  try {
    // --- Étape 1 : Créer/trouver le document ---
    if (dryRun) {
      console.log(`  [DRY-RUN] Créerait document: ${def.citationKey}`)
    }

    const document = dryRun
      ? { id: 'dry-run-id' }
      : await findOrCreateDocument({
          citationKey: def.citationKey,
          documentType: 'jurisprudence',
          officialTitleAr: def.titleAr,
          officialTitleFr: def.titleFr,
          primaryCategory: def.primaryCategory,
          secondaryCategories: ['jurisprudence', 'cassation'],
          tags: def.tags,
          legalDomains: [def.domain],
          canonicalSourceId: cassationSourceId,
          sourceUrls: ['http://www.cassation.tn'],
        })

    // --- Étape 2 : Lier les pages ---
    const pagesResult = await db.query<any>(
      `SELECT id, url, title, word_count, meta_date
       FROM web_pages
       WHERE web_source_id = $1
         AND structured_data->>'theme' = $2
         AND status IN ('crawled', 'indexed')
       ORDER BY COALESCE(meta_date, last_crawled_at) DESC NULLS LAST`,
      [cassationSourceId, themeCode]
    )

    for (let i = 0; i < pagesResult.rows.length; i++) {
      const page = pagesResult.rows[i]
      if (!dryRun) {
        try {
          await linkPageToDocument(
            page.id,
            document.id,
            null,       // articleNumber (pas applicable pour jurisprudence)
            i + 1,      // pageOrder (ordre de découverte)
            'full_document',
            i === 0    // isPrimaryPage (première page = primary)
          )
          result.pagesLinked++
        } catch {
          result.pagesLinked++
        }
      } else {
        result.pagesLinked++
      }
    }

    if (dryRun) {
      console.log(`  [DRY-RUN] Lierait ${result.pagesLinked} pages`)
      return result
    }

    // --- Étape 3 : Marquer comme 'partial' puis consolider ---
    await updateConsolidationStatus(document.id, 'partial')

    console.log(`  🔄 Consolidation (collection)...`)
    const consolidation = await consolidateCollection(document.id)

    if (consolidation.success) {
      result.consolidatedLength = consolidation.consolidatedTextLength
    } else {
      result.status = 'error'
      result.error = consolidation.errors.join('; ')
    }

    return result

  } catch (err: any) {
    return { ...result, status: 'error', error: err.message }
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const flags = parseArgs()

  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║   Traitement des thèmes juridiques cassation.tn         ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log()

  if (flags.dryRun) console.log('🔍 Mode DRY-RUN : aucune modification en base\n')

  const cassationSourceId = await getCassationSourceId()
  if (!cassationSourceId) {
    console.error('❌ Source cassation.tn introuvable en DB')
    console.error('   → Vérifiez que cassation.tn est configuré comme web_source')
    process.exit(1)
  }
  console.log(`✅ Source cassation.tn: ${cassationSourceId}\n`)

  // Découvrir les thèmes
  console.log('📡 Découverte des thèmes cassation crawlés...\n')
  const allThemes = await discoverThemes(cassationSourceId)

  // Filtrer selon arguments
  let themesToProcess: ThemeInfo[]
  if (flags.theme) {
    const found = allThemes.find(t => t.themeCode === flags.theme)
    if (!found) {
      console.error(`❌ Thème "${flags.theme}" non trouvé`)
      process.exit(1)
    }
    themesToProcess = [found]
  } else {
    themesToProcess = flags.force
      ? allThemes
      : allThemes.filter(t => t.pageCount > 0 || !t.hasDocument)
  }

  // Afficher résumé
  console.log(`📊 ${allThemes.length} thèmes définis, ${themesToProcess.length} à traiter\n`)

  // Afficher tableau
  console.log('┌─────┬──────────────────────────────────┬───────┬──────────┐')
  console.log('│  #  │ Thème                             │ Pages │ Status   │')
  console.log('├─────┼──────────────────────────────────┼───────┼──────────┤')
  for (const t of allThemes) {
    const toProcess = themesToProcess.some(tp => tp.themeCode === t.themeCode)
    const status = t.hasDocument ? 'existant ' : 'nouveau  '
    const flag = toProcess ? '▶' : ' '
    const nameTrunc = t.nameFr.substring(0, 32).padEnd(32)
    console.log(`│ ${flag}${t.themeCode.padEnd(3)} │ ${nameTrunc} │ ${String(t.pageCount).padStart(5) } │ ${status} │`)
  }
  console.log('└─────┴──────────────────────────────────┴───────┴──────────┘')
  console.log()

  if (themesToProcess.length === 0) {
    console.log('⚠️ Aucun thème à traiter. Utilisez --force pour retraiter les existants.')
    await db.end()
    return
  }

  // Traiter chaque thème
  const results: ProcessResult[] = []
  for (const theme of themesToProcess) {
    console.log(`\n📋 Traitement thème ${theme.themeCode} — "${theme.nameFr}"`)
    console.log(`   ${theme.pageCount} pages avec ce thème en DB`)
    const result = await processTheme(theme.themeCode, cassationSourceId, flags.dryRun)
    results.push(result)
    const icon = result.status === 'created' ? '✅' : result.status === 'skipped' ? '⏭️' : '❌'
    console.log(`   ${icon} ${result.status} — ${result.pagesLinked} pages liées`)
    if (result.error) console.log(`   ⚠️  ${result.error}`)
  }

  // Résumé final
  const created = results.filter(r => r.status === 'created').length
  const errors = results.filter(r => r.status === 'error').length
  const totalPages = results.reduce((s, r) => s + r.pagesLinked, 0)

  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log(`║  Résultat : ${created} créés, ${errors} erreurs, ${totalPages} pages liées`)
  console.log('╚══════════════════════════════════════════════════════════╝')

  await db.end()
}

main().catch(err => {
  console.error('❌ Erreur fatale:', err)
  process.exit(1)
})
