/**
 * Script CLI : Crawl des codes juridiques IORT
 *
 * Utilisation :
 *   npx tsx scripts/crawl-iort-codes.ts --list
 *   npx tsx scripts/crawl-iort-codes.ts --discover
 *   npx tsx scripts/crawl-iort-codes.ts --all
 *   npx tsx scripts/crawl-iort-codes.ts --code "المجلة التجارية" --dry
 *   npx tsx scripts/crawl-iort-codes.ts --code "المجلة التجارية"
 *
 * Variables d'environnement requises :
 *   DATABASE_URL=postgresql://moncabinet:...@127.0.0.1:5433/qadhya
 */

import 'dotenv/config'
import { IortSessionManager } from '../lib/web-scraper/iort-scraper-utils'
import {
  navigateToCodesSelectionPage,
  parseAvailableCodes,
  selectCodeAndNavigate,
  parseTocItems,
  crawlCode,
  getOrCreateIortSource,
  IORT_SITEIORT_URL,
  type IortCodeCrawlStats,
} from '../lib/web-scraper/iort-codes-scraper'

// Ajout de la fonction de découverte inline (pour le mode --discover)
async function runDiscover(session: IortSessionManager): Promise<void> {
  console.log('\n=== MODE DÉCOUVERTE ===\n')

  await session.init()
  const page = session.getPage()

  // Étape 1 : Homepage
  console.log('1. Navigation homepage...')
  await page.goto(IORT_SITEIORT_URL, { waitUntil: 'load', timeout: 60000 })
  await new Promise(r => setTimeout(r, 3000))

  const homepageInfo = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    jslCalls: Array.from(new Set(
      Array.from(document.querySelectorAll('[onclick]'))
        .flatMap(el => [...(el.getAttribute('onclick') || '').matchAll(/_JSL\s*\(_PAGE_\s*,\s*'(\w+)'/g)])
        .map(m => m[1]),
    )).sort(),
    links: Array.from(document.querySelectorAll('a')).map(a => ({
      text: (a.textContent || '').trim().substring(0, 60),
      href: a.href,
      onclick: a.getAttribute('onclick') || '',
    })).filter(l => l.text.length > 0),
  }))

  console.log('Homepage URL:', homepageInfo.url)
  console.log('Titre:', homepageInfo.title)
  console.log('_JSL IDs disponibles:', homepageInfo.jslCalls.join(', '))
  console.log('\nLiens:')
  homepageInfo.links.slice(0, 20).forEach(l =>
    console.log(`  [${l.text}] onclick="${l.onclick}" href="${l.href}"`),
  )

  // Étape 2 : Tenter navigation M49
  console.log('\n2. Tentative navigation M49...')
  try {
    await page.evaluate(() => {
      // @ts-expect-error WebDev
      _JSL(_PAGE_, 'M49', '_self', '', '')
    })
    await page.waitForLoadState('load')
    await new Promise(r => setTimeout(r, 3000))

    const afterM49 = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      bodyPreview: (document.body.textContent || '').trim().substring(0, 500),
      selects: Array.from(document.querySelectorAll('select')).map(s => ({
        name: s.name,
        optionCount: s.options.length,
        firstOptions: Array.from(s.options).slice(0, 5).map(o => o.text),
      })),
      jslCalls: Array.from(new Set(
        Array.from(document.querySelectorAll('[onclick]'))
          .flatMap(el => [...(el.getAttribute('onclick') || '').matchAll(/_JSL\s*\(_PAGE_\s*,\s*'(\w+)'/g)])
          .map(m => m[1]),
      )).sort(),
    }))

    console.log('URL après M49:', afterM49.url)
    console.log('Titre:', afterM49.title)
    console.log('Selects:', JSON.stringify(afterM49.selects, null, 2))
    console.log('_JSL IDs:', afterM49.jslCalls.join(', '))
    console.log('Body preview:', afterM49.bodyPreview)

    // Étape 3 : Si on est sur la page codes, parser les codes disponibles
    if (afterM49.selects.some(s => s.optionCount > 3)) {
      console.log('\n3. Parsing des codes disponibles...')
      const codes = await parseAvailableCodes(page)
      console.log(`${codes.length} codes trouvés:`)
      codes.forEach((c, i) => console.log(`  ${i + 1}. ${c.name} (${c.nameFr || '?'})`))

      // Étape 4 : Si on a المجلة التجارية, naviguer vers sa TOC
      const commercial = codes.find(c => c.name.includes('التجارية'))
      if (commercial) {
        console.log('\n4. Navigation vers المجلة التجارية...')
        await selectCodeAndNavigate(page, commercial)
        await new Promise(r => setTimeout(r, 3000))

        const tocUrl = page.url()
        console.log('URL TOC:', tocUrl)

        const tocItems = await parseTocItems(page)
        console.log(`${tocItems.length} sections dans la TOC:`)
        tocItems.slice(0, 20).forEach(item =>
          console.log(`  ${'  '.repeat(item.depth)}[${item.resultIndex}] ${item.title.substring(0, 80)}`),
        )
      }
    }
  } catch (err) {
    console.error('Erreur navigation M49:', err instanceof Error ? err.message : err)
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  const listMode = args.includes('--list')
  const discoverMode = args.includes('--discover')
  const allMode = args.includes('--all')
  const dryRun = args.includes('--dry') || args.includes('--dry-run')
  const codeIdx = args.indexOf('--code')
  const codeName = codeIdx !== -1 ? args[codeIdx + 1] : null

  if (!listMode && !discoverMode && !allMode && !codeName) {
    console.log(`
Usage:
  npx tsx scripts/crawl-iort-codes.ts --list
      Liste les codes disponibles sur IORT

  npx tsx scripts/crawl-iort-codes.ts --discover
      Explore la structure du site (debug/développement)

  npx tsx scripts/crawl-iort-codes.ts --all [--dry]
      Crawl tous les codes en séquence

  npx tsx scripts/crawl-iort-codes.ts --code "المجلة التجارية" --dry
      Test navigation + extraction sans sauvegarde en DB

  npx tsx scripts/crawl-iort-codes.ts --code "المجلة التجارية"
      Crawl complet avec sauvegarde en DB

Exemples:
  npx tsx scripts/crawl-iort-codes.ts --discover
  npx tsx scripts/crawl-iort-codes.ts --list
  npx tsx scripts/crawl-iort-codes.ts --all
  npx tsx scripts/crawl-iort-codes.ts --code "مجلة الشغل" --dry
    `)
    process.exit(0)
  }

  const session = new IortSessionManager()

  try {
    if (discoverMode) {
      await runDiscover(session)
      return
    }

    await session.init()

    if (listMode) {
      await navigateToCodesSelectionPage(session)
      const page = session.getPage()
      const codes = await parseAvailableCodes(page)

      console.log(`\n✅ ${codes.length} codes disponibles sur IORT:\n`)
      codes.forEach((c, i) => {
        console.log(`  ${String(i + 1).padStart(2)}. ${c.name.padEnd(55)} | ${c.nameFr || '(non mappé)'}`)
      })
      return
    }

    if (allMode) {
      console.log(`\n=== CRAWL DE TOUS LES CODES (dryRun=${dryRun}) ===\n`)

      await navigateToCodesSelectionPage(session)
      const page = session.getPage()
      const codes = await parseAvailableCodes(page)
      console.log(`${codes.length} codes détectés\n`)

      const sourceId = dryRun ? 'dry-run' : await getOrCreateIortSource()
      const allStats: IortCodeCrawlStats[] = []

      for (const code of codes) {
        console.log(`\n--- ${code.name} (${code.nameFr || '?'}) ---`)
        try {
          const stats = await crawlCode(session, sourceId, code.name, dryRun)
          allStats.push(stats)
          console.log(`  ✓ ${stats.crawled} nouveaux, ${stats.updated} MAJ, ${stats.skipped} inchangés, ${stats.errors} erreurs`)
        } catch (err) {
          console.error(`  ✗ Erreur: ${err instanceof Error ? err.message : err}`)
          allStats.push({ codeName: code.name, totalSections: 0, crawled: 0, updated: 0, skipped: 0, errors: 1, elapsedMs: 0 })
        }
      }

      console.log('\n=== RÉSUMÉ GLOBAL ===')
      const totals = allStats.reduce((acc, s) => ({
        sections: acc.sections + s.totalSections,
        crawled: acc.crawled + s.crawled,
        updated: acc.updated + s.updated,
        skipped: acc.skipped + s.skipped,
        errors: acc.errors + s.errors,
        time: acc.time + s.elapsedMs,
      }), { sections: 0, crawled: 0, updated: 0, skipped: 0, errors: 0, time: 0 })

      console.log(`Codes     : ${allStats.length}`)
      console.log(`Sections  : ${totals.sections}`)
      console.log(`Nouveaux  : ${totals.crawled}`)
      console.log(`MAJ       : ${totals.updated}`)
      console.log(`Inchangés : ${totals.skipped}`)
      console.log(`Erreurs   : ${totals.errors}`)
      console.log(`Temps     : ${Math.round(totals.time / 1000)}s`)
      return
    }

    if (codeName) {
      console.log(`\nCrawl du code: "${codeName}" (dryRun=${dryRun})\n`)

      const sourceId = dryRun ? 'dry-run' : await getOrCreateIortSource()
      const stats = await crawlCode(session, sourceId, codeName, dryRun)

      console.log('\n=== Résultat ===')
      console.log(`Code      : ${stats.codeName}`)
      console.log(`Sections  : ${stats.totalSections}`)
      console.log(`Nouveaux  : ${stats.crawled}`)
      console.log(`MAJ       : ${stats.updated}`)
      console.log(`Inchangés : ${stats.skipped}`)
      console.log(`Erreurs   : ${stats.errors}`)
      console.log(`Temps     : ${Math.round(stats.elapsedMs / 1000)}s`)
    }

  } catch (err) {
    console.error('\n❌ Erreur:', err instanceof Error ? err.message : err)
    process.exit(1)
  } finally {
    await session.close().catch(() => {})
  }
}

main()
