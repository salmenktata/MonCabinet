#!/usr/bin/env tsx
/**
 * Script: Ajouter IORT (Imprimerie Officielle) comme source web
 *
 * Usage:
 *   npm run add-iort-source
 *   ou
 *   tsx scripts/add-iort-source.ts
 */

import { db, closePool } from '@/lib/db/postgres'
import { createWebSource } from '@/lib/web-scraper'
import type { CreateWebSourceInput } from '@/lib/web-scraper'

const IORT_SOURCE_CONFIG: CreateWebSourceInput = {
  // Identification
  name: 'IORT - Imprimerie Officielle de la République Tunisienne',
  baseUrl: 'https://www.iort.tn',
  description: 'Site officiel de l\'Imprimerie Officielle (IORT) - Journal Officiel de la République Tunisienne (JORT)',

  // Classification
  category: 'jort',
  language: 'mixed', // Arabe et Français
  priority: 9, // Haute priorité - source officielle

  // Configuration Crawl
  crawlFrequency: '7 days', // Hebdomadaire (JORT publié régulièrement)
  maxDepth: 5,
  maxPages: 5000,

  // Technical - Site WebDev avec contextes de session
  requiresJavascript: true, // Site dynamique WebDev
  respectRobotsTxt: false, // Site gouvernemental
  ignoreSSLErrors: false, // Certificat valide
  downloadFiles: true, // PDFs des JORTs
  autoIndexFiles: true, // Auto-indexer les PDFs téléchargés

  // Timing
  rateLimitMs: 2000, // 2 secondes entre requêtes (respectueux)

  // Dynamic Config - Optimisé pour WebDev
  dynamicConfig: {
    waitUntil: 'networkidle',
    postLoadDelayMs: 2000,
    waitForLoadingToDisappear: true,
    loadingIndicators: [
      '<!--loading-->',
      '.loading',
      '[data-loading]',
      '.spinner'
    ],
    dynamicTimeoutMs: 15000,
  },

  // URL Patterns
  urlPatterns: [
    'https://www.iort.tn/**',
    'https://iort.tn/**',
  ],

  excludedPatterns: [
    '**/logout**',
    '**/admin/**',
    '**/login**',
  ],

  // CSS Selectors pour extraction
  cssSelectors: {
    content: ['main', 'article', '.content', 'body'],
    title: 'h1',
    exclude: [
      'script',
      'style',
      'nav',
      'header',
      'footer',
      '.navigation',
      '.menu',
    ],
  },

  // Seed URLs - IMPORTANT: Toujours partir de la racine pour WebDev
  seedUrls: [
    'https://www.iort.tn', // Point d'entrée principal
  ],

  customHeaders: {
    'Accept-Language': 'fr-TN,fr;q=0.9,ar-TN;q=0.8,ar;q=0.7',
  },
}

async function main() {
  console.log('🚀 Configuration de la source IORT...\n')

  try {
    // Vérifier si la source existe déjà
    const checkResult = await db.query(
      'SELECT id, name FROM web_sources WHERE base_url = $1',
      [IORT_SOURCE_CONFIG.baseUrl]
    )

    if (checkResult.rows.length > 0) {
      console.log('⚠️  La source IORT existe déjà:')
      console.log(`   ID: ${checkResult.rows[0].id}`)
      console.log(`   Nom: ${checkResult.rows[0].name}`)
      console.log('\n💡 Pour mettre à jour, utilisez l\'API PUT /api/admin/web-sources/{id}')
      process.exit(0)
    }

    // Récupérer un admin pour created_by
    const adminResult = await db.query(
      `SELECT id FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1`
    )

    if (adminResult.rows.length === 0) {
      console.error('❌ Aucun utilisateur admin trouvé')
      console.error('💡 Créez d\'abord un compte admin')
      process.exit(1)
    }

    const adminId = adminResult.rows[0].id
    console.log(`✓ Admin trouvé: ${adminId}`)

    // Créer la source
    console.log('\n📝 Création de la source...')
    const source = await createWebSource(IORT_SOURCE_CONFIG, adminId)

    console.log('\n✅ Source IORT créée avec succès!\n')
    console.log('📋 Détails:')
    console.log(`   ID: ${source.id}`)
    console.log(`   Nom: ${source.name}`)
    console.log(`   URL: ${source.baseUrl}`)
    console.log(`   Catégorie: ${source.category}`)
    console.log(`   Priorité: ${source.priority}`)
    console.log(`   JavaScript requis: ${source.requiresJavascript ? 'Oui ✓' : 'Non'}`)
    console.log(`   Fréquence crawl: ${source.crawlFrequency}`)
    console.log(`   Prochain crawl: ${source.nextCrawlAt || 'À planifier'}`)

    console.log('\n🎯 Prochaines étapes:')
    console.log('   1. Lancer un crawl de test:')
    console.log(`      curl -X POST http://localhost:3000/api/admin/web-sources/${source.id}/crawl \\`)
    console.log(`        -H "Content-Type: application/json" \\`)
    console.log(`        -d '{"type":"single_page","targetUrl":"https://www.iort.tn"}'`)
    console.log('')
    console.log('   2. Surveiller les pages crawlées:')
    console.log(`      curl http://localhost:3000/api/admin/web-sources/${source.id}/pages | jq`)
    console.log('')
    console.log('   3. Indexer dans la knowledge base:')
    console.log(`      curl -X POST http://localhost:3000/api/admin/web-sources/${source.id}/index`)

  } catch (error) {
    console.error('\n❌ Erreur lors de la création de la source:')
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await closePool()
  }
}

main()
