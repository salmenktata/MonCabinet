#!/usr/bin/env npx tsx
/**
 * Script batch : Création des legal_documents depuis iort.gov.tn (5 types de textes)
 *
 * Pour chaque type de texte IORT (قانون, مرسوم, أمر, قرار, رإي) :
 * 1. Crée (ou trouve) le legal_document correspondant
 * 2. Lie les web_pages ayant structured_data->>'textType' = type
 * 3. Consolide le texte (stratégie 'collection')
 *
 * Les pages IORT ont déjà structured_data.textType renseigné par le scraper
 * iort-scraper-utils.ts, donc aucun backfill nécessaire.
 *
 * Usage:
 *   npx tsx scripts/process-iort-types.ts --all              # Tous les types
 *   npx tsx scripts/process-iort-types.ts --type=قانون       # Un seul type
 *   npx tsx scripts/process-iort-types.ts --all --dry-run    # Aperçu
 *   npx tsx scripts/process-iort-types.ts --all --force      # Retraiter existants
 */

import { db } from '@/lib/db/postgres'
import {
  findOrCreateDocument,
  linkPageToDocument,
  getDocumentByCitationKey,
  updateConsolidationStatus,
} from '@/lib/legal-documents/document-service'
import { consolidateCollection } from '@/lib/legal-documents/content-consolidation-service'
import { IORT_DOCUMENT_DOMAINS, type IortDocumentDef } from '@/lib/legal-documents/iort-document-domains'

// =============================================================================
// CLI PARSING
// =============================================================================

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = {
    all: args.includes('--all'),
    type: '',
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
  }

  const typeIdx = args.indexOf('--type')
  if (typeIdx !== -1 && args[typeIdx + 1]) {
    flags.type = args[typeIdx + 1]
  }

  if (!flags.all && !flags.type) {
    console.error('Usage:')
    console.error('  npx tsx scripts/process-iort-types.ts --all [--dry-run] [--force]')
    console.error('  npx tsx scripts/process-iort-types.ts --type=قانون [--dry-run]')
    console.error('')
    console.error(`Types disponibles: ${Object.keys(IORT_DOCUMENT_DOMAINS).join(', ')}`)
    process.exit(1)
  }

  return flags
}

// =============================================================================
// DISCOVERY
// =============================================================================

interface TypeInfo {
  textType: string
  def: IortDocumentDef
  pageCount: number
  hasDocument: boolean
}

async function getIortSourceId(): Promise<string | null> {
  const result = await db.query<any>(
    `SELECT id FROM web_sources WHERE base_url ILIKE '%iort.gov.tn%' LIMIT 1`
  )
  return result.rows[0]?.id || null
}

async function discoverTypes(iortSourceId: string): Promise<TypeInfo[]> {
  const types: TypeInfo[] = []

  for (const [textType, def] of Object.entries(IORT_DOCUMENT_DOMAINS)) {
    const countResult = await db.query<any>(
      `SELECT COUNT(*) as count
       FROM web_pages
       WHERE web_source_id = $1
         AND structured_data->>'textType' = $2
         AND status IN ('crawled', 'indexed')`,
      [iortSourceId, textType]
    )

    const pageCount = parseInt(countResult.rows[0].count, 10)
    const existing = await getDocumentByCitationKey(def.citationKey)

    types.push({
      textType,
      def,
      pageCount,
      hasDocument: existing !== null,
    })
  }

  types.sort((a, b) => b.pageCount - a.pageCount)
  return types
}

// =============================================================================
// PROCESSING
// =============================================================================

interface ProcessResult {
  textType: string
  citationKey: string
  status: 'created' | 'skipped' | 'error'
  pagesLinked: number
  consolidatedLength: number
  error?: string
}

async function processType(
  textType: string,
  iortSourceId: string,
  dryRun: boolean
): Promise<ProcessResult> {
  const def = IORT_DOCUMENT_DOMAINS[textType]
  if (!def) {
    return { textType, citationKey: textType, status: 'error', pagesLinked: 0, consolidatedLength: 0, error: `Type "${textType}" non trouvé` }
  }

  const result: ProcessResult = {
    textType,
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
          documentType: def.documentType as any,
          officialTitleAr: def.titleAr,
          officialTitleFr: def.titleFr,
          primaryCategory: def.primaryCategory,
          secondaryCategories: ['legislation', 'jort', 'officiel'],
          tags: def.tags,
          legalDomains: [def.domain],
          canonicalSourceId: iortSourceId,
          sourceUrls: ['http://www.iort.gov.tn'],
        })

    // --- Étape 2 : Lier les pages ---
    const pagesResult = await db.query<any>(
      `SELECT id, url, title, word_count,
              structured_data->>'year' as year,
              structured_data->>'issueNumber' as issue_number,
              structured_data->>'date' as doc_date
       FROM web_pages
       WHERE web_source_id = $1
         AND structured_data->>'textType' = $2
         AND status IN ('crawled', 'indexed')
       ORDER BY
         CAST(NULLIF(structured_data->>'year', '') AS INTEGER) DESC NULLS LAST,
         CAST(NULLIF(structured_data->>'issueNumber', '') AS INTEGER) DESC NULLS LAST`,
      [iortSourceId, textType]
    )

    for (let i = 0; i < pagesResult.rows.length; i++) {
      const page = pagesResult.rows[i]
      const articleNumber = page.year && page.issue_number
        ? `${page.year}-${page.issue_number}`
        : null

      if (!dryRun) {
        try {
          await linkPageToDocument(
            page.id,
            document.id,
            articleNumber,  // numéro de référence = année-numéro
            i + 1,          // pageOrder
            'full_document',
            i === 0         // isPrimaryPage
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

    // --- Étape 3 : Consolider ---
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
  console.log('║   Traitement des types JORT — iort.gov.tn               ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log()

  if (flags.dryRun) console.log('🔍 Mode DRY-RUN : aucune modification en base\n')

  const iortSourceId = await getIortSourceId()
  if (!iortSourceId) {
    console.error('❌ Source iort.gov.tn introuvable en DB')
    process.exit(1)
  }
  console.log(`✅ Source iort.gov.tn: ${iortSourceId}\n`)

  // Découvrir les types
  console.log('📡 Découverte des types JORT...\n')
  const allTypes = await discoverTypes(iortSourceId)

  // Filtrer selon arguments
  let typesToProcess: TypeInfo[]
  if (flags.type) {
    const found = allTypes.find(t => t.textType === flags.type)
    if (!found) {
      console.error(`❌ Type "${flags.type}" non trouvé dans IORT_DOCUMENT_DOMAINS`)
      process.exit(1)
    }
    typesToProcess = [found]
  } else {
    typesToProcess = flags.force
      ? allTypes
      : allTypes.filter(t => t.pageCount > 0 || !t.hasDocument)
  }

  // Afficher résumé
  console.log(`📊 ${allTypes.length} types définis, ${typesToProcess.length} à traiter\n`)

  console.log('┌───────────┬────────────────────────────────────┬───────┬──────────┐')
  console.log('│ textType  │ Document                           │ Pages │ Status   │')
  console.log('├───────────┼────────────────────────────────────┼───────┼──────────┤')
  for (const t of allTypes) {
    const toProcess = typesToProcess.some(tp => tp.textType === t.textType)
    const status = t.hasDocument ? 'existant ' : 'nouveau  '
    const flag = toProcess ? '▶' : ' '
    const typeTrunc = t.textType.substring(0, 9).padEnd(9)
    const titleTrunc = t.def.titleFr.substring(0, 34).padEnd(34)
    console.log(`│ ${flag}${typeTrunc} │ ${titleTrunc} │ ${String(t.pageCount).padStart(5)} │ ${status} │`)
  }
  console.log('└───────────┴────────────────────────────────────┴───────┴──────────┘')
  console.log()

  if (typesToProcess.length === 0) {
    console.log('⚠️ Aucun type à traiter. Utilisez --force pour retraiter les existants.')
    await db.end()
    return
  }

  // Traiter chaque type
  const results: ProcessResult[] = []
  for (const typeInfo of typesToProcess) {
    console.log(`\n📋 Traitement type "${typeInfo.textType}" — ${typeInfo.def.titleFr}`)
    console.log(`   ${typeInfo.pageCount} pages avec ce type en DB`)
    const result = await processType(typeInfo.textType, iortSourceId, flags.dryRun)
    results.push(result)
    const icon = result.status === 'created' ? '✅' : result.status === 'skipped' ? '⏭️' : '❌'
    console.log(`   ${icon} ${result.status} — ${result.pagesLinked} pages liées`)
    if (result.error) console.log(`   ⚠️  ${result.error}`)
  }

  // Résumé
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
