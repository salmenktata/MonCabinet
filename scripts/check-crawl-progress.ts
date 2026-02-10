#!/usr/bin/env tsx

/**
 * Script pour vérifier la progression d'un crawl en production
 * Usage: tsx scripts/check-crawl-progress.ts <source-id>
 */

import { Pool } from 'pg'

const SOURCE_ID = process.argv[2] || 'a77c5733-0e46-4cdf-bd77-e59985e4755d'

// Configuration pour se connecter via tunnel SSH (port 5434)
const pool = new Pool({
  host: 'localhost',
  port: 5434,
  database: 'qadhya',
  user: 'moncabinet',
  password: process.env.DB_PASSWORD_PROD,
  ssl: false, // Tunnel SSH, pas besoin de SSL
})

async function checkCrawlProgress() {
  const client = await pool.connect()

  try {
    console.log('🔍 Vérification du crawl pour la source:', SOURCE_ID)
    console.log('─'.repeat(80))

    // 1. Info sur la source
    const sourceResult = await client.query(
      `SELECT id, name, base_url, category, status, created_at
       FROM web_sources
       WHERE id = $1`,
      [SOURCE_ID]
    )

    if (sourceResult.rows.length === 0) {
      console.log('❌ Source non trouvée')
      return
    }

    const source = sourceResult.rows[0]
    console.log('\n📦 Source:')
    console.log(`   Nom: ${source.name}`)
    console.log(`   URL: ${source.base_url}`)
    console.log(`   Catégorie: ${source.category}`)
    console.log(`   Statut: ${source.status}`)

    // 2. Jobs de crawl actifs/récents
    const jobsResult = await client.query(
      `SELECT id, status, pages_discovered, pages_crawled, pages_failed,
              started_at, completed_at, error_message,
              EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at)) as duration_seconds
       FROM crawl_jobs
       WHERE web_source_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [SOURCE_ID]
    )

    console.log('\n🔄 Jobs de crawl (5 derniers):')
    if (jobsResult.rows.length === 0) {
      console.log('   Aucun job trouvé')
    } else {
      jobsResult.rows.forEach((job, i) => {
        const isActive = job.status === 'running'
        const emoji = isActive ? '🔄' : job.status === 'completed' ? '✅' : job.status === 'failed' ? '❌' : '⏸️'
        const duration = job.duration_seconds ? `${Math.round(job.duration_seconds)}s` : 'en cours...'

        console.log(`\n   ${emoji} Job #${i + 1} (${job.status})`)
        console.log(`      ID: ${job.id}`)
        console.log(`      Découvertes: ${job.pages_discovered} pages`)
        console.log(`      Crawlées: ${job.pages_crawled} pages`)
        console.log(`      Échouées: ${job.pages_failed} pages`)
        console.log(`      Début: ${new Date(job.started_at).toLocaleString('fr-FR')}`)
        if (job.completed_at) {
          console.log(`      Fin: ${new Date(job.completed_at).toLocaleString('fr-FR')}`)
        }
        console.log(`      Durée: ${duration}`)
        if (job.error_message) {
          console.log(`      ⚠️ Erreur: ${job.error_message}`)
        }
      })
    }

    // 3. Stats des pages par statut
    const statsResult = await client.query(
      `SELECT
         status,
         COUNT(*) as count,
         COUNT(*) FILTER (WHERE is_indexed = true) as indexed_count
       FROM web_pages
       WHERE web_source_id = $1
       GROUP BY status
       ORDER BY count DESC`,
      [SOURCE_ID]
    )

    console.log('\n📊 Statistiques des pages:')
    let totalPages = 0
    let totalIndexed = 0
    statsResult.rows.forEach(stat => {
      totalPages += parseInt(stat.count)
      totalIndexed += parseInt(stat.indexed_count)
      console.log(`   ${stat.status.padEnd(12)}: ${stat.count.toString().padStart(4)} pages (${stat.indexed_count} indexées)`)
    })
    console.log(`   ${'TOTAL'.padEnd(12)}: ${totalPages.toString().padStart(4)} pages (${totalIndexed} indexées)`)

    // 4. Dernières pages crawlées
    const recentPagesResult = await client.query(
      `SELECT url, title, status, error_message, last_crawled_at
       FROM web_pages
       WHERE web_source_id = $1
         AND last_crawled_at IS NOT NULL
       ORDER BY last_crawled_at DESC
       LIMIT 5`,
      [SOURCE_ID]
    )

    console.log('\n📄 Dernières pages crawlées (5):')
    if (recentPagesResult.rows.length === 0) {
      console.log('   Aucune page crawlée encore')
    } else {
      recentPagesResult.rows.forEach((page, i) => {
        const emoji = page.status === 'crawled' ? '✅' : page.status === 'unchanged' ? '♻️' : page.status === 'failed' ? '❌' : '⏳'
        console.log(`\n   ${emoji} Page #${i + 1}`)
        console.log(`      URL: ${page.url}`)
        console.log(`      Titre: ${page.title || 'N/A'}`)
        console.log(`      Statut: ${page.status}`)
        console.log(`      Crawlé: ${new Date(page.last_crawled_at).toLocaleString('fr-FR')}`)
        if (page.error_message) {
          console.log(`      ⚠️ Erreur: ${page.error_message.substring(0, 100)}...`)
        }
      })
    }

    // 5. Pages en erreur
    const errorPagesResult = await client.query(
      `SELECT url, error_message, last_crawled_at
       FROM web_pages
       WHERE web_source_id = $1
         AND status = 'failed'
       ORDER BY last_crawled_at DESC
       LIMIT 5`,
      [SOURCE_ID]
    )

    if (errorPagesResult.rows.length > 0) {
      console.log('\n⚠️ Pages en erreur (5 premières):')
      errorPagesResult.rows.forEach((page, i) => {
        console.log(`\n   ❌ Erreur #${i + 1}`)
        console.log(`      URL: ${page.url}`)
        console.log(`      Message: ${page.error_message?.substring(0, 150)}...`)
        if (page.last_crawled_at) {
          console.log(`      Tenté: ${new Date(page.last_crawled_at).toLocaleString('fr-FR')}`)
        }
      })
    }

    console.log('\n' + '─'.repeat(80))
    console.log('✅ Vérification terminée')

  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

checkCrawlProgress().catch(console.error)
