/**
 * Génère la configuration optimale pour crawler 9anoun.tn en mode hybride
 *
 * Output :
 * - seed_urls.json : Liste des 54 pages d'accueil des codes
 * - web_source_config.json : Configuration complète de la source
 *
 * Usage :
 *   npx tsx scripts/generate-9anoun-config.ts
 */

import { NINEANOUN_CODE_DOMAINS } from '../lib/web-scraper/9anoun-code-domains'
import * as fs from 'fs'
import * as path from 'path'

interface WebSourceConfig {
  name: string
  base_url: string
  requires_javascript: boolean
  follow_links: boolean
  max_pages: number
  max_depth: number
  rate_limit_ms: number
  timeout_ms: number
  use_sitemap: boolean
  download_files: boolean
  seed_urls: string[]
  url_patterns?: string[]
  excluded_patterns?: string[]
}

function generateSeedUrls(): string[] {
  const codes = Object.keys(NINEANOUN_CODE_DOMAINS)
  const seedUrls = codes.map((slug) => `https://9anoun.tn/kb/codes/${slug}`)

  console.log(`✅ ${seedUrls.length} seed URLs générées pour les pages d'accueil des codes`)

  return seedUrls
}

function generateConfig(): WebSourceConfig {
  const seedUrls = generateSeedUrls()

  const config: WebSourceConfig = {
    name: '9anoun.tn - Codes Juridiques (Hybride Optimisé)',
    base_url: 'https://9anoun.tn/kb/codes',

    // Mode hybride : seed URLs en Playwright, articles en fetch statique
    requires_javascript: true,  // Pour pages d'accueil (menu discovery)
    follow_links: true,          // Découverte automatique des articles

    // Limites
    max_pages: 10000,            // Limite haute pour sécurité
    max_depth: 3,                // Profondeur suffisante (accueil → article)

    // Performance
    rate_limit_ms: 100,          // Crawl rapide mais safe
    timeout_ms: 60000,           // 1 min par page (Playwright + menu discovery)

    // Options
    use_sitemap: false,          // Pas de sitemap pour /kb/codes
    download_files: false,       // Articles HTML uniquement

    // Seed URLs : 54 pages d'accueil des codes
    seed_urls: seedUrls,

    // Patterns d'inclusion (optionnel, pour sécurité)
    url_patterns: [
      'https://9anoun.tn/kb/codes/*',
    ],

    // Patterns d'exclusion
    excluded_patterns: [
      '*/search*',     // Exclure pages de recherche
      '*/filter*',     // Exclure pages de filtrage
      '*?page=*',      // Exclure pagination (déjà gérée par menu discovery)
    ],
  }

  return config
}

function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║   🚀 GÉNÉRATION CONFIG 9ANOUN.TN - MODE HYBRIDE OPTIMISÉ     ║')
  console.log('╚════════════════════════════════════════════════════════════════╝')
  console.log('')

  // Générer la configuration
  const config = generateConfig()

  // Créer le dossier output si nécessaire
  const outputDir = path.join(process.cwd(), 'output')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Sauvegarder seed_urls.json
  const seedUrlsPath = path.join(outputDir, '9anoun-seed-urls.json')
  fs.writeFileSync(seedUrlsPath, JSON.stringify(config.seed_urls, null, 2))
  console.log(`✅ Seed URLs sauvegardées : ${seedUrlsPath}`)
  console.log(`   ${config.seed_urls.length} URLs`)
  console.log('')

  // Sauvegarder web_source_config.json
  const configPath = path.join(outputDir, '9anoun-web-source-config.json')
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  console.log(`✅ Configuration sauvegardée : ${configPath}`)
  console.log('')

  // Afficher résumé
  console.log('📊 RÉSUMÉ CONFIGURATION :')
  console.log(`   - Nom : ${config.name}`)
  console.log(`   - Base URL : ${config.base_url}`)
  console.log(`   - Seed URLs : ${config.seed_urls.length}`)
  console.log(`   - Mode : Hybride (Playwright seed → Fetch static articles)`)
  console.log(`   - Max pages : ${config.max_pages}`)
  console.log(`   - Rate limit : ${config.rate_limit_ms}ms`)
  console.log('')

  // Estimation de performance
  console.log('⚡ ESTIMATION PERFORMANCE :')
  console.log(`   Phase 1 : Crawl ${config.seed_urls.length} pages d'accueil`)
  console.log(`             ${config.seed_urls.length} × 15s = ${(config.seed_urls.length * 15 / 60).toFixed(1)} min`)
  console.log(`             Mode : Playwright + Menu Discovery`)
  console.log('')
  console.log(`   Phase 2 : Crawl articles découverts`)
  console.log(`             Estimation 2000-5000 articles`)
  console.log(`             2000 × 200ms ÷ 40 concurrency = 10 sec`)
  console.log(`             5000 × 200ms ÷ 40 concurrency = 25 sec`)
  console.log(`             Mode : Fetch Statique Ultra-Rapide`)
  console.log('')
  console.log(`   Phase 3 : Indexation OpenAI Turbo (parallèle)`)
  console.log(`             Masqué pendant crawl`)
  console.log('')
  console.log(`   ⏱️  TOTAL ESTIMÉ : 15-20 minutes 🚀🚀🚀`)
  console.log(`   📉 GAIN vs baseline : 42h → 15-20min = -99.2% !`)
  console.log('')

  // Instructions
  console.log('📝 PROCHAINES ÉTAPES :')
  console.log('')
  console.log('   1. Créer/Modifier la source web via Super Admin')
  console.log('      URL : /super-admin/web-sources')
  console.log('')
  console.log('   2. Copier la configuration depuis :')
  console.log(`      ${configPath}`)
  console.log('')
  console.log('   3. Lancer le crawl via API ou interface')
  console.log('')
  console.log('   4. Monitorer : /super-admin/web-sources/{id}')
  console.log('')
  console.log('   Attendu :')
  console.log('   - Phase 1 : 54 pages en ~13 min (Playwright)')
  console.log('   - Phase 2 : N articles en ~10-30 sec (Fetch static)')
  console.log('   - Phase 3 : Indexation parallèle (masquée)')
  console.log('')
  console.log('✅ Configuration générée avec succès !')
}

main()
