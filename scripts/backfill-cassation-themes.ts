#!/usr/bin/env npx tsx
/**
 * Backfill des thèmes cassation.tn pour les pages existantes
 *
 * Les pages cassation.tn ont été crawlées sans que le thème soit stocké dans
 * structured_data (le crawler TYPO3 collectait tous les liens puis crawlait
 * chaque page sans l'association thème→URL).
 *
 * Ce script :
 * 1. Interroge cassation.tn par thème via TYPO3 (uniquement la liste d'URLs, pas le contenu)
 * 2. Compare avec les web_pages existantes en DB
 * 3. UPDATE structured_data.theme pour chaque page matchée
 *
 * Usage:
 *   npx tsx scripts/backfill-cassation-themes.ts              # Tous les thèmes
 *   npx tsx scripts/backfill-cassation-themes.ts --theme=TA   # Un seul thème
 *   npx tsx scripts/backfill-cassation-themes.ts --dry-run    # Aperçu sans modifier la DB
 *   npx tsx scripts/backfill-cassation-themes.ts --offline    # Mode hors-ligne (URL pattern seulement)
 */

import { db } from '@/lib/db/postgres'
import { CASSATION_THEMES } from '@/lib/web-scraper/typo3-csrf-utils'

// =============================================================================
// CLI PARSING
// =============================================================================

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = {
    theme: '',
    dryRun: args.includes('--dry-run'),
    offline: args.includes('--offline'),
  }

  const themeIdx = args.indexOf('--theme')
  if (themeIdx !== -1 && args[themeIdx + 1]) {
    flags.theme = args[themeIdx + 1]
  }

  return flags
}

// =============================================================================
// DISCOVERY (mode online : requête TYPO3)
// =============================================================================

/**
 * Récupère la liste des URLs pour un thème cassation.tn via TYPO3
 * Mode léger : uniquement URLs de la liste, pas de scraping du contenu
 */
async function fetchThemeUrls(themeCode: string): Promise<string[]> {
  const { extractCsrfTokens, buildSearchPostBody } = await import('@/lib/web-scraper/typo3-csrf-utils')
  const { fetchHtml } = await import('@/lib/web-scraper/scraper-service')
  const cheerio = await import('cheerio')

  const JURISPRUDENCE_URL = 'http://www.cassation.tn/fr/%D9%81%D9%82%D9%87-%D8%A7%D9%84%D9%82%D8%B6%D8%A7%D8%A1/'

  const csrfResult = await extractCsrfTokens(JURISPRUDENCE_URL, { ignoreSSLErrors: true })
  if (!csrfResult) {
    console.warn(`  [backfill] Impossible d'extraire les tokens CSRF pour thème ${themeCode}`)
    return []
  }

  const { tokens, sessionCookies } = csrfResult
  const baseOrigin = new URL(JURISPRUDENCE_URL).origin
  const headers: Record<string, string> = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ar,fr;q=0.9,en;q=0.8',
    'Referer': JURISPRUDENCE_URL,
    'Origin': baseOrigin,
  }
  if (sessionCookies) headers['Cookie'] = sessionCookies

  const body = buildSearchPostBody(tokens, { theme: themeCode })
  const result = await fetchHtml(tokens.formAction, {
    method: 'POST',
    body,
    ignoreSSLErrors: true,
    stealthMode: true,
    headers,
  })

  if (!result.success || !result.html) {
    console.warn(`  [backfill] Échec POST thème ${themeCode}: ${result.error}`)
    return []
  }

  const allUrls: string[] = []
  const $ = cheerio.load(result.html)

  // Extraire les liens de la liste de résultats
  $('.tx-upload-example a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    const absoluteUrl = href.startsWith('http')
      ? href
      : `${baseOrigin}${href.startsWith('/') ? '' : '/'}${href}`
    if (
      absoluteUrl.startsWith(baseOrigin) &&
      !absoluteUrl.includes('#') &&
      !absoluteUrl.toLowerCase().endsWith('.pdf')
    ) {
      allUrls.push(absoluteUrl)
    }
  })

  // Suivre la pagination
  const paginationUrls: string[] = []
  $('ul.f3-widget-paginator a[href], .f3-widget-paginator a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    const abs = href.startsWith('http')
      ? href
      : `${baseOrigin}${href.startsWith('/') ? '' : '/'}${href}`
    if (abs.includes('currentPage') || abs.includes('@widget')) {
      paginationUrls.push(abs)
    }
  })

  for (const pageUrl of [...new Set(paginationUrls)]) {
    await new Promise(r => setTimeout(r, 2000)) // rate limit
    const pageResult = await fetchHtml(pageUrl, {
      ignoreSSLErrors: true,
      stealthMode: true,
      headers,
    })
    if (pageResult.success && pageResult.html) {
      const $p = cheerio.load(pageResult.html)
      $p('.tx-upload-example a[href]').each((_, el) => {
        const href = $p(el).attr('href')
        if (!href) return
        const abs = href.startsWith('http')
          ? href
          : `${baseOrigin}${href.startsWith('/') ? '' : '/'}${href}`
        if (abs.startsWith(baseOrigin) && !abs.includes('#') && !abs.toLowerCase().endsWith('.pdf')) {
          allUrls.push(abs)
        }
      })
    }
  }

  return [...new Set(allUrls)]
}

// =============================================================================
// UPDATE DB
// =============================================================================

/**
 * Récupère l'ID de la source cassation.tn
 */
async function getCassationSourceId(): Promise<string | null> {
  const result = await db.query<any>(
    `SELECT id FROM web_sources WHERE base_url ILIKE '%cassation.tn%' LIMIT 1`
  )
  return result.rows[0]?.id || null
}

/**
 * Met à jour le thème dans structured_data pour les pages matchées
 * Retourne le nombre de pages mises à jour
 */
async function updatePagesTheme(
  sourceId: string,
  urls: string[],
  themeCode: string,
  dryRun: boolean
): Promise<number> {
  if (urls.length === 0) return 0

  // Trouver les web_pages correspondantes
  const result = await db.query<any>(
    `SELECT id, url
     FROM web_pages
     WHERE web_source_id = $1
       AND url = ANY($2)`,
    [sourceId, urls]
  )

  const pages = result.rows
  if (pages.length === 0) return 0

  if (dryRun) {
    console.log(`  [DRY-RUN] Mettrait à jour ${pages.length} pages avec theme="${themeCode}"`)
    return pages.length
  }

  // UPDATE en batch
  const pageIds = pages.map((p: any) => p.id)
  await db.query(
    `UPDATE web_pages
     SET structured_data = jsonb_set(
       COALESCE(structured_data, '{}'),
       '{theme}',
       $1
     )
     WHERE id = ANY($2)`,
    [JSON.stringify(themeCode), pageIds]
  )

  return pages.length
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const flags = parseArgs()

  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║  Backfill thèmes cassation.tn → structured_data   ║')
  console.log('╚════════════════════════════════════════════════════╝')
  console.log()

  if (flags.dryRun) console.log('🔍 Mode DRY-RUN : aucune modification en base\n')
  if (flags.offline) console.log('📴 Mode OFFLINE : basé uniquement sur les pages existantes\n')

  // Récupérer l'ID de la source cassation.tn
  const cassationSourceId = await getCassationSourceId()
  if (!cassationSourceId) {
    console.error('❌ Source cassation.tn introuvable en DB')
    process.exit(1)
  }
  console.log(`✅ Source cassation.tn trouvée: ${cassationSourceId}\n`)

  // Déterminer les thèmes à traiter
  const themesToProcess = flags.theme
    ? [flags.theme]
    : Object.keys(CASSATION_THEMES)

  if (flags.theme && !CASSATION_THEMES[flags.theme]) {
    console.error(`❌ Thème "${flags.theme}" inconnu. Thèmes disponibles: ${Object.keys(CASSATION_THEMES).join(', ')}`)
    process.exit(1)
  }

  let totalUpdated = 0
  let totalPages = 0

  for (const themeCode of themesToProcess) {
    const themeName = CASSATION_THEMES[themeCode]
    console.log(`\n📋 Thème ${themeCode} — ${themeName.fr} / ${themeName.ar}`)

    let urls: string[] = []

    if (flags.offline) {
      // Mode hors-ligne : sélectionner toutes les pages cassation sans thème
      // (ne peut pas discriminer par thème, utile pour debug)
      console.log(`  [offline] Skipping thème ${themeCode} (mode offline ne peut pas discriminer par thème)`)
      continue
    }

    // Mode online : interroger cassation.tn
    console.log(`  🌐 Interrogation cassation.tn pour thème ${themeCode}...`)
    try {
      urls = await fetchThemeUrls(themeCode)
      console.log(`  📊 ${urls.length} URLs trouvées`)
      totalPages += urls.length
    } catch (err: any) {
      console.error(`  ❌ Erreur fetchThemeUrls: ${err.message}`)
      continue
    }

    if (urls.length === 0) {
      console.log(`  ⚠️ Aucune URL trouvée pour ce thème`)
      continue
    }

    // Mettre à jour la DB
    const updated = await updatePagesTheme(cassationSourceId, urls, themeCode, flags.dryRun)
    console.log(`  ✅ ${updated}/${urls.length} pages mises à jour avec theme="${themeCode}"`)
    totalUpdated += updated

    // Rate limit entre thèmes
    await new Promise(r => setTimeout(r, 3000))
  }

  console.log('\n╔════════════════════════════════════════════════════╗')
  console.log(`║  Résultat: ${totalUpdated} pages mises à jour (${totalPages} URLs trouvées)`)
  console.log('╚════════════════════════════════════════════════════╝')

  await db.end()
}

main().catch(err => {
  console.error('❌ Erreur fatale:', err)
  process.exit(1)
})
