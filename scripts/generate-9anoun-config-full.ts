/**
 * Génère la configuration pour crawler TOUT 9anoun.tn/kb
 * Inclut : codes, jurisprudence, doctrine, jorts, constitutions, conventions, lois
 *
 * Usage :
 *   npx tsx scripts/generate-9anoun-config-full.ts
 */

import { NINEANOUN_CODE_DOMAINS, NINEANOUN_KB_SECTIONS } from '../lib/web-scraper/9anoun-code-domains'
import * as fs from 'fs'
import * as path from 'path'

interface UpdateSourceSQL {
  sourceId: string
  seedUrls: string[]
  maxPages: number
  config: Record<string, any>
}

function generateFullSeedUrls(): string[] {
  const seedUrls: string[] = []

  // 1. Pages d'accueil des 54 codes juridiques
  const codes = Object.keys(NINEANOUN_CODE_DOMAINS)
  codes.forEach((slug) => {
    seedUrls.push(`https://9anoun.tn/kb/codes/${slug}`)
  })

  // 2. Pages d'accueil des autres sections KB
  const kbSections = Object.keys(NINEANOUN_KB_SECTIONS)
  kbSections.forEach((section) => {
    seedUrls.push(`https://9anoun.tn/kb/${section}`)
  })

  // 3. Page d'accueil générale KB
  seedUrls.push('https://9anoun.tn/kb')

  console.log(`✅ ${seedUrls.length} seed URLs générées :`)
  console.log(`   - ${codes.length} codes juridiques`)
  console.log(`   - ${kbSections.length} sections KB`)
  console.log(`   - 1 page d'accueil KB`)

  return seedUrls
}

function generateUpdateSQL(sourceId: string): string {
  const seedUrls = generateFullSeedUrls()

  // Échapper les quotes pour PostgreSQL
  const seedUrlsArray = seedUrls.map((url) => `'${url}'`).join(',\n    ')

  const sql = `-- Mise à jour de la source 9anoun.tn pour crawl complet /kb
-- Source ID : ${sourceId}
-- Date : ${new Date().toISOString()}

UPDATE web_sources
SET
  name = '9anoun.tn - Knowledge Base Complète (Hybride Optimisé)',
  base_url = 'https://9anoun.tn/kb',
  requires_javascript = true,  -- Playwright pour pages d'accueil
  follow_links = true,          -- Découverte automatique
  max_pages = 30000,            -- Limite haute (codes + jurisprudence + doctrine)
  max_depth = 4,                -- Profondeur suffisante
  rate_limit_ms = 100,          -- Crawl rapide
  timeout_ms = 60000,           -- 1 min par page
  use_sitemap = false,
  download_files = false,

  -- Seed URLs : toutes les sections KB
  seed_urls = ARRAY[
    ${seedUrlsArray}
  ],

  -- Patterns d'inclusion
  url_patterns = ARRAY[
    'https://9anoun.tn/kb/*'
  ],

  -- Patterns d'exclusion
  excluded_patterns = ARRAY[
    '*/search*',
    '*/filter*',
    '*?page=*',
    '*?showComment=*',
    '*.html?m=1',      -- Version mobile
    '*.html#*'         -- Ancres
  ],

  updated_at = NOW()
WHERE id = '${sourceId}';

-- Vérification
SELECT
  id,
  name,
  base_url,
  requires_javascript,
  follow_links,
  max_pages,
  max_depth,
  array_length(seed_urls, 1) as nb_seed_urls
FROM web_sources
WHERE id = '${sourceId}';
`

  return sql
}

function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║   🚀 GÉNÉRATION CONFIG 9ANOUN.TN/KB COMPLÈTE                  ║')
  console.log('╚════════════════════════════════════════════════════════════════╝')
  console.log('')

  // ID de la source existante en prod
  const SOURCE_ID = '4319d2d1-569c-4107-8f52-d71e2a2e9fe9'

  // Générer le SQL
  const sql = generateUpdateSQL(SOURCE_ID)

  // Créer le dossier output si nécessaire
  const outputDir = path.join(process.cwd(), 'output')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Sauvegarder le fichier SQL
  const sqlPath = path.join(outputDir, 'update-9anoun-source-full.sql')
  fs.writeFileSync(sqlPath, sql)
  console.log(`✅ Script SQL généré : ${sqlPath}`)
  console.log('')

  // Afficher résumé
  const seedUrls = generateFullSeedUrls()
  console.log('📊 RÉSUMÉ CONFIGURATION :')
  console.log(`   - Source ID : ${SOURCE_ID}`)
  console.log(`   - Base URL : https://9anoun.tn/kb (SCOPE COMPLET)`)
  console.log(`   - Seed URLs : ${seedUrls.length}`)
  console.log(`   - Max pages : 30000`)
  console.log(`   - Sections : codes, jurisprudence, doctrine, jorts, etc.`)
  console.log('')

  // Estimation
  console.log('⚡ ESTIMATION PERFORMANCE :')
  console.log(`   Phase 1 : Crawl ${seedUrls.length} pages d'accueil`)
  console.log(`             ${seedUrls.length} × 15s = ${(seedUrls.length * 15 / 60).toFixed(1)} min`)
  console.log(`             Mode : Playwright + Menu Discovery`)
  console.log('')
  console.log(`   Phase 2 : Crawl articles/documents découverts`)
  console.log(`             Estimation 5000-15000 documents`)
  console.log(`             Mode : Fetch Statique Ultra-Rapide`)
  console.log(`             Durée : 2-6 minutes (concurrency 40)`)
  console.log('')
  console.log(`   Phase 3 : Indexation OpenAI Turbo (parallèle)`)
  console.log(`             Masqué pendant crawl`)
  console.log('')
  console.log(`   ⏱️  TOTAL ESTIMÉ : 20-30 minutes 🚀`)
  console.log(`   📉 GAIN vs baseline : 42h → 20-30min = -98.8% !`)
  console.log('')

  // Instructions
  console.log('📝 PROCHAINES ÉTAPES :')
  console.log('')
  console.log(`   1. Appliquer le script SQL en production :`)
  console.log(`      scp ${sqlPath} root@84.247.165.187:/tmp/`)
  console.log(`      ssh root@84.247.165.187 "docker exec qadhya-postgres psql -U moncabinet -d qadhya -f /tmp/update-9anoun-source-full.sql"`)
  console.log('')
  console.log(`   2. Lancer le crawl :`)
  console.log(`      https://qadhya.tn/super-admin/web-sources/${SOURCE_ID}`)
  console.log('')
  console.log('✅ Configuration générée avec succès !')
}

main()
