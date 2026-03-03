/**
 * Wrapper CommonJS pour appliquer le fix IORT constitution via tunnel 5434
 * Usage: node scripts/run-fix-iort.js
 */

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

// Lire DATABASE_URL depuis .env.local du projet principal
const envPath = path.join(process.env.HOME, 'Projets/GitHub/Avocat/.env.local')
let dbUrl

try {
  const envContent = fs.readFileSync(envPath, 'utf8')
  const match = envContent.match(/^DATABASE_URL=(.+)/m)
  if (!match) throw new Error('DATABASE_URL not found')
  // Adapter pour tunnel prod (port 5434)
  dbUrl = match[1]
    .replace(':5433/', ':5434/')
    .replace('@localhost:', '@127.0.0.1:')
  if (!dbUrl.includes(':5434')) {
    dbUrl = dbUrl.replace('@127.0.0.1:', '@127.0.0.1:5434/')
      .replace(/\/([^/]+)$/, '/$1')
  }
} catch (e) {
  console.error('Erreur lecture .env.local:', e.message)
  process.exit(1)
}

const pool = new Pool({ connectionString: dbUrl, max: 1 })

async function run() {
  const client = await pool.connect()
  try {
    console.log('🔧 Fix IORT constitution KB via tunnel 5434...')

    const r1 = await client.query(`
      UPDATE knowledge_base
      SET
        category = 'constitution',
        title = '\u062f\u0633\u062a\u0648\u0631 \u0627\u0644\u062c\u0645\u0647\u0648\u0631\u064a\u0629 \u0627\u0644\u062a\u0648\u0646\u0633\u064a\u0629 2022',
        metadata = metadata || '{"normLevel": "constitution", "sourceOrigin": "iort_gov_tn"}'::jsonb
      WHERE id = '8c3e1fa7-d082-41d3-84ad-db253796b57c'
    `)
    console.log('KB updated:', r1.rowCount, 'rows')

    const r2 = await client.query(`
      UPDATE knowledge_base_chunks
      SET metadata = metadata || '{"normLevel": "constitution"}'::jsonb
      WHERE knowledge_base_id = '8c3e1fa7-d082-41d3-84ad-db253796b57c'
    `)
    console.log('Chunks updated:', r2.rowCount, 'rows')

    const r3 = await client.query(`
      INSERT INTO cron_schedules (cron_name, display_name, description, cron_expression, timeout_ms, alert_on_failure, is_active)
      VALUES (
        'iort-constitution-refresh',
        'Refresh Constitution IORT',
        'Crawl mensuel IORT : OCR PDF 42 pages, reindex article par article (~142 fasl), boost RAG x1.62',
        '0 3 1 * *',
        660000,
        true,
        true
      )
      ON CONFLICT (cron_name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        cron_expression = EXCLUDED.cron_expression,
        timeout_ms = EXCLUDED.timeout_ms,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    `)
    console.log('Cron schedule:', r3.rowCount === 1 ? 'inserted/updated' : 'unchanged')

    // Vérification
    const vKb = await client.query(`SELECT title, category, metadata->>'normLevel' as norm_level, chunk_count FROM knowledge_base WHERE id = '8c3e1fa7-d082-41d3-84ad-db253796b57c'`)
    console.log('\nKB:', JSON.stringify(vKb.rows[0]))

    const vChunks = await client.query(`SELECT COUNT(*) as count, metadata->>'normLevel' as norm_level FROM knowledge_base_chunks WHERE knowledge_base_id = '8c3e1fa7-d082-41d3-84ad-db253796b57c' GROUP BY norm_level`)
    console.log('Chunks:', JSON.stringify(vChunks.rows))

    console.log('\n✅ Fix appliqué avec succès!')
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
