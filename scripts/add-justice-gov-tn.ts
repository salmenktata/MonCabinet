/**
 * Ajout de la source web justice.gov.tn — Ministère de la Justice Tunisien
 *
 * Site TYPO3 avec références juridiques : codes, conventions, guides procéduraux
 * URLs: https://www.justice.gov.tn/index.php?id=XXX
 *
 * Usage:
 *   # Local (port 5433)
 *   npx tsx scripts/add-justice-gov-tn.ts
 *
 *   # Production via tunnel SSH (port 5434)
 *   npx tsx scripts/add-justice-gov-tn.ts --production
 */

import 'dotenv/config'
import { Pool } from 'pg'

// =============================================================================
// CONFIG DB
// =============================================================================

const args = process.argv.slice(2)
const isProduction = args.includes('--production')

const DB_CONFIG = isProduction
  ? {
      host: '127.0.0.1',
      port: 5434, // Tunnel SSH prod
      database: 'qadhya',
      user: 'moncabinet',
      password: process.env.DB_PASSWORD || '',
    }
  : {
      host: '127.0.0.1',
      port: 5433, // DB locale
      database: process.env.POSTGRES_DB || 'qadhya',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || '',
    }

// =============================================================================
// CONFIGURATION SOURCE
// =============================================================================

const JUSTICE_SOURCE = {
  name: 'Ministère de la Justice Tunisien — المراجع القانونية',
  baseUrl: 'https://www.justice.gov.tn',
  description:
    'Portail officiel des références juridiques du Ministère de la Justice tunisien. ' +
    'Contient les codes juridiques tunisiens (COC, CSP, Code Pénal, Code de Commerce...), ' +
    'les guides de procédures judiciaires, et les conventions bilatérales (pays arabes, africains, européens, asiatiques).',
  categories: ['codes', 'procedures', 'guides', 'conventions'],
  language: 'ar',
  priority: 8, // Haute priorité — source officielle gouvernementale

  // TYPO3 : nécessite JavaScript
  requiresJavascript: true,

  // Crawl mensuel (contenu stable)
  crawlFrequency: '30 days',

  // Depth 3 : index → section → article
  maxDepth: 3,
  maxPages: 500,
  followLinks: true,
  downloadFiles: true,
  respectRobotsTxt: false, // Site gouvernemental
  rateLimitMs: 2000, // 2s entre requêtes — courtois
  autoIndexFiles: false,
  ignoreSSLErrors: true, // Certificats gouvernementaux parfois invalides

  // Sélecteurs CSS — TYPO3 standard + fallbacks
  cssSelectors: {
    content: [
      '#content',
      '.csc-default',
      '.tx-sfeventmgt-pi1',
      '#main-content',
      '.main-content',
      'article',
      '.content',
    ],
    title: ['h1', 'h2.csc-firstHeader', '.page-title', '.ce-headline-first'],
    exclude: [
      '#header',
      '#nav',
      '.top-bar',
      '#footer',
      '.f3-widget-paginator',
      '#sidebar',
      '.breadcrumb',
      '.site-search',
      '.social-share',
    ],
  },

  // Filtrer uniquement les pages TYPO3 avec contenu (index.php?id=XXX)
  urlPatterns: ['index.php?id='],
  excludedPatterns: [
    'cHash=',             // Cache hash TYPO3 (doublons)
    '/typo3/',            // Backend TYPO3
    '/fileadmin/',        // Fichiers statiques
    'id=575',             // Actualités (hors scope - news)
    'tx_ttnews',          // Articles d'actualité TYPO3
    'L=1',                // Langue française (doublon)
    'L=2',                // Langue anglaise
    'no_cache=',          // Params techniques
    'print=1',            // Pages impression
    'type=',              // Types de page TYPO3
    'logintype=',         // Formulaire login
    'tx_felogin',         // Module login TYPO3
  ],

  // Pages d'entrée directes vers le contenu juridique
  seedUrls: [
    // ─── Portail principal des références juridiques ───
    'https://www.justice.gov.tn/index.php?id=186',

    // ─── Codes juridiques (المجلات) ───
    'https://www.justice.gov.tn/index.php?id=223',   // Hub codes
    'https://www.justice.gov.tn/index.php?id=287',   // مجلة الالتزامات والعقود (COC)
    'https://www.justice.gov.tn/index.php?id=288',   // مجلة الأحوال الشخصية (CSP)
    'https://www.justice.gov.tn/index.php?id=289',   // المجلة التجارية
    'https://www.justice.gov.tn/index.php?id=290',   // مجلة الشركات التجارية
    'https://www.justice.gov.tn/index.php?id=291',   // مجلة المرافعات المدنية والتجارية
    'https://www.justice.gov.tn/index.php?id=292',   // المجلة الجزائية
    'https://www.justice.gov.tn/index.php?id=293',   // مجلة الإجراءات الجزائية
    'https://www.justice.gov.tn/index.php?id=294',   // مجلة الحقوق العينية
    'https://www.justice.gov.tn/index.php?id=295',   // مجلة حماية الطفل
    'https://www.justice.gov.tn/index.php?id=296',   // مجلة الجنسية التونسية
    'https://www.justice.gov.tn/index.php?id=297',   // مجلة القانون الدولي الخاص
    'https://www.justice.gov.tn/index.php?id=298',   // مجلة الشغل
    'https://www.justice.gov.tn/index.php?id=299',   // مجلة التحكيم

    // ─── Conventions bilatérales (اتفاقيات قضائية ثنائية) ───
    'https://www.justice.gov.tn/index.php?id=222',   // Hub conventions
    'https://www.justice.gov.tn/index.php?id=283',   // Pays arabes
    'https://www.justice.gov.tn/index.php?id=284',   // Pays africains
    'https://www.justice.gov.tn/index.php?id=285',   // Pays européens
    'https://www.justice.gov.tn/index.php?id=286',   // Pays asiatiques

    // ─── Droits et procédures (حقوق وإجراءات) ───
    'https://www.justice.gov.tn/index.php?id=225',   // Hub procédures

    // ─── Guides procéduraux (أدلة إجرائية) ───
    'https://www.justice.gov.tn/index.php?id=224',   // Hub guides
    'https://www.justice.gov.tn/index.php?id=327',   // Guides tribunaux
    'https://www.justice.gov.tn/index.php?id=347',   // Professions judiciaires
  ],

  // Config dynamique TYPO3
  dynamicConfig: {
    waitUntil: 'load' as const,         // PAS 'networkidle' (bloque WebSocket)
    waitForSelector: '#content',
    postLoadDelayMs: 800,               // Délai rendu TYPO3
    scrollToLoad: false,
  },

  // Extraction ciblée du contenu juridique
  extractionConfig: {
    legalContentSelector: '#content',
    contentLanguage: 'ar' as const,
    preserveHierarchy: true,
    removeSelectors: [
      '#header', '#nav', '#footer', '#sidebar',
      '.breadcrumb', '.pagination', '.site-search',
      '.tx-news', '.social-media-links',
    ],
    noisePatterns: [
      'جميع الحقوق محفوظة',
      'وزارة العدل',
      'تصفح الموقع',
      'خريطة الموقع',
    ],
  },
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('🏛️  Ajout source web : Ministère de la Justice Tunisien\n')
  console.log(`📊 Environnement: ${isProduction ? 'PRODUCTION' : 'LOCAL'}`)
  console.log(`   DB: ${DB_CONFIG.database}@${DB_CONFIG.host}:${DB_CONFIG.port}\n`)

  const pool = new Pool(DB_CONFIG)

  try {
    await pool.query('SELECT 1')
    console.log('✅ Connexion DB OK\n')

    // Vérifier si la source existe déjà
    const existing = await pool.query(
      `SELECT id, name FROM web_sources WHERE base_url = $1`,
      [JUSTICE_SOURCE.baseUrl]
    )

    if (existing.rows.length > 0) {
      console.log(`⏭️  Source déjà existante: ${existing.rows[0].name} (ID: ${existing.rows[0].id})`)
      console.log('    Mise à jour de la configuration...\n')

      await pool.query(
        `UPDATE web_sources SET
          description = $2,
          categories = $3,
          language = $4,
          priority = $5,
          requires_javascript = $6,
          crawl_frequency = $7::interval,
          max_depth = $8,
          max_pages = $9,
          follow_links = $10,
          download_files = $11,
          respect_robots_txt = $12,
          rate_limit_ms = $13,
          ignore_ssl_errors = $14,
          css_selectors = $15,
          url_patterns = $16,
          excluded_patterns = $17,
          seed_urls = $18,
          dynamic_config = $19,
          extraction_config = $20,
          auto_index_files = $21,
          updated_at = NOW()
        WHERE id = $1`,
        [
          existing.rows[0].id,
          JUSTICE_SOURCE.description,
          JUSTICE_SOURCE.categories,
          JUSTICE_SOURCE.language,
          JUSTICE_SOURCE.priority,
          JUSTICE_SOURCE.requiresJavascript,
          JUSTICE_SOURCE.crawlFrequency,
          JUSTICE_SOURCE.maxDepth,
          JUSTICE_SOURCE.maxPages,
          JUSTICE_SOURCE.followLinks,
          JUSTICE_SOURCE.downloadFiles,
          JUSTICE_SOURCE.respectRobotsTxt,
          JUSTICE_SOURCE.rateLimitMs,
          JUSTICE_SOURCE.ignoreSSLErrors,
          JSON.stringify(JUSTICE_SOURCE.cssSelectors),
          JUSTICE_SOURCE.urlPatterns,
          JUSTICE_SOURCE.excludedPatterns,
          JUSTICE_SOURCE.seedUrls,
          JSON.stringify(JUSTICE_SOURCE.dynamicConfig),
          JSON.stringify(JUSTICE_SOURCE.extractionConfig),
          JUSTICE_SOURCE.autoIndexFiles,
        ]
      )

      console.log('✅ Configuration mise à jour !')
      return
    }

    // Créer la source
    const result = await pool.query(
      `INSERT INTO web_sources (
        name, base_url, description, categories, language, priority,
        crawl_frequency, max_depth, max_pages, requires_javascript,
        css_selectors, url_patterns, excluded_patterns,
        seed_urls, dynamic_config, extraction_config,
        use_sitemap, download_files, respect_robots_txt, rate_limit_ms,
        follow_links, auto_index_files, ignore_ssl_errors,
        is_active, rag_enabled, health_status,
        next_crawl_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::interval, $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16,
        false, $17, $18, $19,
        $20, $21, $22,
        true, true, 'unknown',
        NOW(), NOW(), NOW()
      )
      RETURNING id, name`,
      [
        JUSTICE_SOURCE.name,
        JUSTICE_SOURCE.baseUrl,
        JUSTICE_SOURCE.description,
        JUSTICE_SOURCE.categories,
        JUSTICE_SOURCE.language,
        JUSTICE_SOURCE.priority,
        JUSTICE_SOURCE.crawlFrequency,           // $7
        JUSTICE_SOURCE.maxDepth,                  // $8
        JUSTICE_SOURCE.maxPages,                  // $9
        JUSTICE_SOURCE.requiresJavascript,        // $10
        JSON.stringify(JUSTICE_SOURCE.cssSelectors),   // $11
        JUSTICE_SOURCE.urlPatterns,               // $12
        JUSTICE_SOURCE.excludedPatterns,          // $13
        JUSTICE_SOURCE.seedUrls,                  // $14
        JSON.stringify(JUSTICE_SOURCE.dynamicConfig),  // $15
        JSON.stringify(JUSTICE_SOURCE.extractionConfig), // $16
        JUSTICE_SOURCE.downloadFiles,             // $17
        JUSTICE_SOURCE.respectRobotsTxt,          // $18
        JUSTICE_SOURCE.rateLimitMs,               // $19
        JUSTICE_SOURCE.followLinks,               // $20
        JUSTICE_SOURCE.autoIndexFiles,            // $21
        JUSTICE_SOURCE.ignoreSSLErrors,           // $22
      ]
    )

    const newId = result.rows[0].id
    console.log(`✅ Source créée: ${result.rows[0].name}`)
    console.log(`   ID: ${newId}`)
    console.log(`   Seed URLs: ${JUSTICE_SOURCE.seedUrls.length} pages d'entrée`)
    console.log(`   Profil: TYPO3 | Langue: AR | Rate limit: 2s | Max pages: 500\n`)

    console.log('📋 Prochaines étapes:')
    console.log('   1. Vérifier dans l\'admin UI: /super-admin/web-sources')
    console.log('   2. Tester l\'extraction: bouton "Test" sur la source')
    console.log('   3. Lancer le premier crawl via le bouton "Crawl"')
    console.log('   4. Après crawl → indexer les pages via "Index KB"')

  } catch (error) {
    console.error('\n❌ Erreur:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
