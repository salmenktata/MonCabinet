#!/usr/bin/env tsx

/**
 * Script pour arrêter tous les jobs de crawl actifs en production
 */

import { Pool } from 'pg'

// Configuration pour se connecter via tunnel SSH (port 5434)
const pool = new Pool({
  host: 'localhost',
  port: 5434,
  database: 'qadhya',
  user: 'moncabinet',
  password: process.env.DB_PASSWORD_PROD || process.env.DB_PASSWORD,
  ssl: false,
})

async function stopAllCrawlJobs() {
  const client = await pool.connect()

  try {
    console.log('🛑 Arrêt de tous les jobs de crawl actifs...\n')

    // 1. Récupérer tous les jobs en cours
    const runningJobsResult = await client.query(
      `SELECT id, web_source_id, pages_discovered, pages_crawled, started_at
       FROM crawl_jobs
       WHERE status = 'running'
       ORDER BY started_at DESC`
    )

    if (runningJobsResult.rows.length === 0) {
      console.log('✅ Aucun job de crawl actif trouvé.')
      return
    }

    console.log(`📋 ${runningJobsResult.rows.length} job(s) actif(s) trouvé(s):\n`)

    runningJobsResult.rows.forEach((job, i) => {
      const duration = Date.now() - new Date(job.started_at).getTime()
      const durationMin = Math.round(duration / 60000)
      console.log(`   ${i + 1}. Job ${job.id.substring(0, 8)}...`)
      console.log(`      Source: ${job.web_source_id.substring(0, 8)}...`)
      console.log(`      Découvertes: ${job.pages_discovered}`)
      console.log(`      Crawlées: ${job.pages_crawled}`)
      console.log(`      Durée: ${durationMin} min`)
      console.log('')
    })

    // 2. Marquer tous les jobs comme 'failed' avec un message explicatif
    const updateResult = await client.query(
      `UPDATE crawl_jobs
       SET status = 'failed',
           completed_at = NOW(),
           error_message = 'Arrêt manuel via script stop-all-crawl-jobs'
       WHERE status = 'running'
       RETURNING id`
    )

    console.log(`\n✅ ${updateResult.rows.length} job(s) arrêté(s) avec succès.`)

    // 3. Afficher les sources concernées
    const sourcesResult = await client.query(
      `SELECT DISTINCT ws.id, ws.name, ws.base_url
       FROM web_sources ws
       JOIN crawl_jobs cj ON cj.web_source_id = ws.id
       WHERE cj.id = ANY($1)`,
      [updateResult.rows.map(r => r.id)]
    )

    if (sourcesResult.rows.length > 0) {
      console.log('\n📦 Sources concernées:')
      sourcesResult.rows.forEach((source, i) => {
        console.log(`   ${i + 1}. ${source.name}`)
        console.log(`      URL: ${source.base_url}`)
        console.log(`      ID: ${source.id}`)
        console.log('')
      })
    }

    console.log('─'.repeat(80))
    console.log('✅ Tous les jobs de crawl ont été arrêtés.')
    console.log('\n💡 Les crons automatiques reprendront selon le planning.')
    console.log('💡 Pour désactiver les crons, modifiez les crontabs sur le VPS.')

  } catch (error) {
    console.error('❌ Erreur lors de l\'arrêt des jobs:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

stopAllCrawlJobs().catch(console.error)
