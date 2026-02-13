/**
 * Ajouter les web sources Phase 3.1 en production
 *
 * Usage:
 *   npx tsx scripts/add-web-sources-phase3.1.ts --production
 */
import { Pool } from 'pg'
import * as fs from 'fs'
import * as path from 'path'

// =============================================================================
// CONFIGURATION
// =============================================================================

const PROD_DB = {
  host: 'localhost',
  port: 5434, // Tunnel SSH
  database: 'qadhya',
  user: 'moncabinet',
  password: process.env.DB_PASSWORD || '',
}

// =============================================================================
// TYPES
// =============================================================================

interface WebSourceToAdd {
  name: string
  url: string
  category: string
  description: string
  priority: 'high' | 'medium' | 'low'
  crawl_frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  requires_javascript: boolean
  notes: string
}

// =============================================================================
// FONCTIONS
// =============================================================================

async function addWebSource(pool: Pool, source: WebSourceToAdd) {
  // Vérifier si existe déjà (par base_url)
  const existing = await pool.query(
    `SELECT id, name FROM web_sources WHERE base_url = $1`,
    [source.url]
  )

  if (existing.rows.length > 0) {
    console.log(`⏭️  Skip: ${source.name} (URL existe: ${existing.rows[0].name})`)
    return { action: 'skipped', id: existing.rows[0].id }
  }

  // Mapper crawl_frequency vers interval PostgreSQL
  const crawlIntervalMap: Record<string, string> = {
    daily: '1 day',
    weekly: '7 days',
    monthly: '30 days',
    quarterly: '90 days',
  }

  const crawlInterval = crawlIntervalMap[source.crawl_frequency] || '7 days'

  // Insérer
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
      source.name,
      source.url,
      source.category,
      `${source.description}\n\nNotes: ${source.notes}`,
      true, // is_active
      source.requires_javascript,
      crawlInterval,
      source.priority === 'high' ? 1000 : (source.priority === 'medium' ? 500 : 100), // max_pages
      source.priority === 'high' ? 5 : (source.priority === 'medium' ? 3 : 2), // max_depth
      true, // respect_robots_txt
      true, // auto_crawl_enabled
      true, // auto_index
      true, // follow_links
    ]
  )

  console.log(`✅ Ajouté: ${source.name} (ID: ${result.rows[0].id})`)
  return { action: 'added', id: result.rows[0].id }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('🚀 Ajout Web Sources Phase 3.1\n')

  const args = process.argv.slice(2)
  const isProduction = args.includes('--production')
  const dryRun = args.includes('--dry-run')

  if (!isProduction) {
    console.error('❌ Spécifiez --production pour ajouter en prod')
    process.exit(1)
  }

  const pool = new Pool(PROD_DB)

  console.log(`📊 Environnement: PRODUCTION`)
  console.log(`   Base: ${PROD_DB.database}@${PROD_DB.host}:${PROD_DB.port}`)
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'AJOUT RÉEL'}\n`)

  try {
    // Vérifier connexion
    await pool.query('SELECT 1')
    console.log('✅ Connexion DB OK\n')

    // Charger sources
    const sourcesPath = path.join(process.cwd(), 'data/web-sources/phase3.1-sources-a-ajouter.json')
    const sources: WebSourceToAdd[] = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'))

    console.log(`📥 ${sources.length} sources à traiter\n`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    let added = 0
    let skipped = 0
    let errors = 0

    for (const source of sources) {
      try {
        if (dryRun) {
          console.log(`✓ [DRY RUN] ${source.name} → ${source.url}`)
          added++
          continue
        }

        const result = await addWebSource(pool, source)
        if (result.action === 'added') {
          added++
        } else {
          skipped++
        }
      } catch (error: any) {
        console.error(`❌ Erreur: ${source.name} - ${error.message}`)
        errors++
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 RÉSUMÉ:')
    console.log(`   Ajoutées: ${added}`)
    console.log(`   Ignorées (doublons): ${skipped}`)
    console.log(`   Erreurs: ${errors}`)

    // Afficher état web_sources
    if (!dryRun) {
      const stats = await pool.query(`
        SELECT
          category::text,
          COUNT(*) as count
        FROM web_sources
        WHERE is_active = true
        GROUP BY category
        ORDER BY count DESC
      `)

      console.log('\n📊 État Web Sources Production:')
      stats.rows.forEach(row => {
        console.log(`   ${row.category}: ${row.count}`)
      })

      const total = await pool.query(`SELECT COUNT(*) FROM web_sources WHERE is_active = true`)
      console.log(`\n   Total actif: ${total.rows[0].count}`)
    }

    console.log('\n✅ Terminé !')

  } catch (error: any) {
    console.error(`\n❌ Erreur:`, error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main().catch(console.error)
