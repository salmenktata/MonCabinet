/**
 * Script - Créer source web legislation.tn
 *
 * Crée une source web pour crawler les codes juridiques tunisiens
 * depuis le portail officiel legislation.tn
 *
 * Usage : npx tsx scripts/create-legislation-tn-source.ts
 */

import { query } from '@/lib/db/postgres'

async function main() {
  console.log('🚀 Création source web legislation.tn\n')

  try {
    // 1. Vérifier si la source existe déjà
    const existing = await query(
      `SELECT id, name FROM web_sources WHERE base_url LIKE '%legislation.tn%'`
    )

    if (existing.rows.length > 0) {
      console.log('⚠️  Source legislation.tn existe déjà:', existing.rows[0])
      console.log('ID:', existing.rows[0].id)
      process.exit(0)
    }

    // 2. Créer la source web
    const result = await query(
      `INSERT INTO web_sources (
        name,
        base_url,
        category,
        description,
        is_active,
        crawl_config,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING id, name, base_url`,
      [
        'Législation Tunisienne (legislation.tn)',
        'https://legislation.tn',
        'codes',
        'Portail officiel des codes et lois de la République Tunisienne. Contient les codes complets (pénal, civil, commerce, travail, etc.) avec modifications et versions consolidées.',
        true,
        JSON.stringify({
          // Config crawl
          max_depth: 3,
          max_pages: 200,
          rate_limit_ms: 2000,

          // Pages de démarrage (codes principaux)
          start_urls: [
            'https://legislation.tn/fr/codes',
            'https://legislation.tn/ar/codes',
          ],

          // Patterns URL à crawler
          url_patterns: [
            'https://legislation.tn/*/code-*',
            'https://legislation.tn/*/loi-*',
          ],

          // Patterns URL à exclure
          exclude_patterns: [
            '/recherche',
            '/contact',
            '/apropos',
          ],

          // JavaScript requis
          requires_javascript: true,

          // Timeout navigation
          timeout: 30000,
        }),
      ]
    )

    console.log('✅ Source créée avec succès !')
    console.log('   ID:', result.rows[0].id)
    console.log('   Nom:', result.rows[0].name)
    console.log('   URL:', result.rows[0].base_url)
    console.log('')

    console.log('📋 Prochaines étapes :')
    console.log('1. Configurer extraction dans lib/web-scraper/content-extractor.ts')
    console.log('2. Lancer crawl initial')
    console.log('3. Indexer documents dans KB')
    console.log('')

    process.exit(0)
  } catch (error) {
    console.error('❌ Erreur:', error)
    process.exit(1)
  }
}

main()
