#!/usr/bin/env tsx
/**
 * Ajouter da5ira.com comme source web de doctrine juridique tunisienne
 *
 * da5ira.com est un blog Blogger juridique en arabe (~1500 articles).
 * Utilise le profil 'blogger' existant (sitemap, fetch statique, pas Playwright).
 * sourceOrigin → 'da5ira_tn' → boost RAG 1.05× (doctrine qualité)
 *
 * Prérequis : tunnel SSH actif (npm run tunnel:start)
 * Usage    : npx tsx scripts/seed-da5ira-source.ts
 */
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya',
  max: 3,
})

async function main() {
  console.log('=== Seed da5ira.com web source ===\n')

  // Vérifier si déjà présent
  const existing = await pool.query(
    `SELECT id, name, is_active FROM web_sources WHERE base_url = $1`,
    ['https://da5ira.com']
  )

  if (existing.rows.length > 0) {
    const src = existing.rows[0]
    console.log(`Source déjà présente: ${src.name} (id=${src.id}, active=${src.is_active})`)
    await pool.end()
    return
  }

  const result = await pool.query(
    `INSERT INTO web_sources (
      name,
      base_url,
      category,
      description,
      is_active,
      requires_javascript,
      crawl_frequency,
      max_pages,
      max_depth,
      respect_robots_txt,
      auto_crawl_enabled,
      auto_index,
      follow_links,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::interval, $8, $9, $10, $11, $12, $13, NOW(), NOW())
    RETURNING id, name`,
    [
      'Da5ira — Doctrine Juridique Tunisienne',
      'https://da5ira.com',
      'doctrine',
      'Blog juridique tunisien en arabe. Analyse, commentaires et doctrine sur le droit tunisien. ~1500 articles. Profil: blogger (sitemap, fetch statique).',
      true,        // is_active
      false,       // requires_javascript (Blogger = fetch statique)
      '30 days',   // crawl_frequency mensuel (contenu stable)
      1500,        // max_pages
      3,           // max_depth
      true,        // respect_robots_txt
      false,       // auto_crawl_enabled (crawl manuel d'abord pour valider qualité)
      true,        // auto_index
      true,        // follow_links
    ]
  )

  const newId = result.rows[0].id
  console.log(`Source créée: da5ira.com (id=${newId})`)
  console.log('\nProchaines étapes :')
  console.log('  1. Admin UI → Sources Web → da5ira.com → Lancer crawl test (10 pages)')
  console.log('  2. Vérifier category=doctrine et doc_type=DOCTRINE après indexation')
  console.log('  3. Si qualité OK → activer auto_crawl_enabled via PATCH admin')

  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
