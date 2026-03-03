#!/usr/bin/env npx tsx
/**
 * Script de crawl des articles manquants de la Constitution tunisienne
 *
 * Contexte : La KB ne contient que quelques articles spécifiques des constitutions 1959 et 2022.
 * الفصل الأول (Article 1) et la majorité des articles sont absents.
 *
 * Ce script :
 * 1. Interroge la DB pour identifier les articles déjà indexés
 * 2. Génère les URLs manquantes (articles 1-142 du دستور 2022)
 * 3. Appelle POST /api/admin/web-sources/{id}/scrape-urls par batches de 20
 *
 * Usage (depuis le VPS pour bypasser Nginx 120s) :
 *   CRON_SECRET=xxx BASE_URL=http://localhost:3000 npx tsx scripts/crawl-constitution-articles.ts
 *
 * Usage local (hors prod) :
 *   CRON_SECRET=xxx BASE_URL=https://qadhya.tn npx tsx scripts/crawl-constitution-articles.ts [--dry-run]
 */

import { Pool } from 'pg'

const isDryRun = process.argv.includes('--dry-run')
const CRON_SECRET = process.env.CRON_SECRET
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const DATABASE_URL = process.env.DATABASE_URL

// ID de la source 9anoun.tn - Constitutions (trouvé via DB)
const CONSTITUTION_SOURCE_ID = '97e75496-4fec-4379-bb55-b1aac327eeb1'

// Patterns URL 9anoun.tn par constitution
const URL_PATTERNS = {
  '2022': (n: number) =>
    `https://9anoun.tn/kb/constitutions/projet-constitution-tunisie-2022-version-mise-jour/projet-constitution-2022-version-mise-jour-article-${n}`,
  '1959': (n: number) =>
    `https://9anoun.tn/kb/constitutions/constitution-tunisie-1959/constitution-1959-article-${n}`,
  'proposition-2022': (n: number) =>
    `https://9anoun.tn/kb/constitutions/proposition-projet-constitution-tunisie-2022/proposition-projet-constitution-2022-article-${n}`,
}

// Nombre total d'articles par constitution
const ARTICLE_COUNTS = {
  '2022': 142,  // دستور 2022 (صيغة محيّنة) — constitution en vigueur
  '1959': 67,   // دستور 1959 (articles modifiés — à compléter)
}

const BATCH_SIZE = 20
const BATCH_DELAY_MS = 3000  // 3s entre batches pour ne pas surcharger Playwright

async function getIndexedArticleUrls(pool: Pool): Promise<Set<string>> {
  const result = await pool.query<{ source_file: string }>(
    `SELECT source_file FROM knowledge_base WHERE category = 'constitution' AND source_file IS NOT NULL`
  )
  return new Set(result.rows.map(r => r.source_file))
}

async function scrapeUrlsBatch(urls: string[]): Promise<{ scraped: number; errors: number }> {
  if (!CRON_SECRET) {
    throw new Error('CRON_SECRET manquant')
  }

  const response = await fetch(
    `${BASE_URL}/api/admin/web-sources/${CONSTITUTION_SOURCE_ID}/scrape-urls`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({
        urls,
        concurrency: 3,
        indexAfterScrape: true,  // indexation immédiate après scrape
        downloadFiles: false,
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API error ${response.status}: ${err}`)
  }

  const data = (await response.json()) as { scraped?: number; errors?: number; total?: number }
  return { scraped: data.scraped ?? 0, errors: data.errors ?? 0 }
}

async function main() {
  if (!CRON_SECRET) {
    console.error('ERROR: CRON_SECRET manquant')
    console.error('Usage: CRON_SECRET=xxx BASE_URL=http://localhost:3000 npx tsx scripts/crawl-constitution-articles.ts')
    process.exit(1)
  }

  console.log(`[Crawl Constitution] Démarrage`)
  console.log(`  BASE_URL: ${BASE_URL}`)
  console.log(`  Mode: ${isDryRun ? 'DRY RUN' : 'PRODUCTION'}`)

  // 1. Récupérer les URLs déjà indexées
  let indexedUrls = new Set<string>()
  if (DATABASE_URL) {
    const pool = new Pool({ connectionString: DATABASE_URL })
    indexedUrls = await getIndexedArticleUrls(pool)
    await pool.end()
    console.log(`\n[Crawl] ${indexedUrls.size} articles constitution déjà indexés`)
  } else {
    console.log('\n[Crawl] DATABASE_URL absent — aucun filtre sur articles existants (tous seront re-scrapés)')
  }

  // 2. Générer les URLs manquantes pour دستور 2022 (صيغة محيّنة) — priorité maximale
  const missingUrls: string[] = []

  // دستور 2022 (constitution en vigueur) — articles 1-142
  for (let n = 1; n <= ARTICLE_COUNTS['2022']; n++) {
    const url = URL_PATTERNS['2022'](n)
    if (!indexedUrls.has(url)) {
      missingUrls.push(url)
    }
  }

  // دستور 1959 — articles 1-67 (complète les articles modifiés déjà indexés)
  for (let n = 1; n <= ARTICLE_COUNTS['1959']; n++) {
    const url = URL_PATTERNS['1959'](n)
    if (!indexedUrls.has(url)) {
      missingUrls.push(url)
    }
  }

  console.log(`[Crawl] ${missingUrls.length} articles à crawler`)

  if (missingUrls.length === 0) {
    console.log('[Crawl] Rien à faire.')
    return
  }

  // Afficher les 10 premiers
  console.log(`\nPremières URLs à crawler :`)
  for (const url of missingUrls.slice(0, 10)) {
    console.log(`  ${url}`)
  }
  if (missingUrls.length > 10) {
    console.log(`  ... et ${missingUrls.length - 10} autres`)
  }

  if (isDryRun) {
    console.log('\n[DRY RUN] Aucune action effectuée.')
    return
  }

  // 3. Scraper par batches
  let totalScraped = 0
  let totalErrors = 0
  const batches = Math.ceil(missingUrls.length / BATCH_SIZE)

  for (let i = 0; i < missingUrls.length; i += BATCH_SIZE) {
    const batch = missingUrls.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    console.log(`\n[Batch ${batchNum}/${batches}] ${batch.length} URLs...`)

    try {
      const result = await scrapeUrlsBatch(batch)
      totalScraped += result.scraped
      totalErrors += result.errors
      console.log(`  → Scrapé: ${result.scraped} | Erreurs: ${result.errors}`)
    } catch (err) {
      console.error(`  [ERR] Batch ${batchNum} échoué:`, err)
      totalErrors += batch.length
    }

    // Pause entre batches sauf le dernier
    if (i + BATCH_SIZE < missingUrls.length) {
      console.log(`  Pause ${BATCH_DELAY_MS / 1000}s...`)
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  console.log(`\n[Crawl Constitution] Terminé : ${totalScraped} scrapés, ${totalErrors} erreurs`)
  console.log(`[Crawl] Après indexation, relancer 'backfill-constitution-embeddings.ts' pour les embeddings Ollama`)
  console.log(`[Crawl] IMPORTANT: corriger les titres "مشروع دستور" → "دستور" en prod:`)
  console.log(`  docker exec -i qadhya-postgres psql -U moncabinet -d qadhya < scripts/fix-constitution-titles.sql`)
}

main().catch((err) => {
  console.error('[Crawl FATAL]', err)
  process.exit(1)
})
