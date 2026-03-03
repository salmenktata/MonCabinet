#!/usr/bin/env npx tsx
/**
 * Fix one-shot : corrige la KB IORT constitution mal catégorisée.
 * Lance via tunnel SSH prod (port 5434) :
 *   DATABASE_URL=postgres://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya npx tsx scripts/fix-iort-constitution-kb.ts
 */

import { Pool } from 'pg'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('❌ DATABASE_URL requis (pointer sur tunnel 5434)')
  process.exit(1)
}

const pool = new Pool({ connectionString: dbUrl, max: 1 })

async function run() {
  const client = await pool.connect()
  try {
    console.log('🔧 Fix IORT constitution KB...')

    // Fix 1: KB table
    const r1 = await client.query(`
      UPDATE knowledge_base
      SET
        category = 'constitution',
        title = 'دستور الجمهورية التونسية 2022',
        metadata = metadata || '{"normLevel": "constitution", "sourceOrigin": "iort_gov_tn"}'::jsonb
      WHERE id = '8c3e1fa7-d082-41d3-84ad-db253796b57c'
    `)
    console.log(`✅ KB updated: ${r1.rowCount} rows`)

    // Fix 2: Chunks metadata
    const r2 = await client.query(`
      UPDATE knowledge_base_chunks
      SET metadata = metadata || '{"normLevel": "constitution"}'::jsonb
      WHERE knowledge_base_id = '8c3e1fa7-d082-41d3-84ad-db253796b57c'
    `)
    console.log(`✅ Chunks updated: ${r2.rowCount} rows`)

    // Fix 3: Cron schedule
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
    console.log(`✅ Cron schedule: ${r3.rowCount === 1 ? 'inserted/updated' : 'no change'}`)

    // Vérification
    const vKb = await client.query(`
      SELECT id, title, category, metadata->>'normLevel' as norm_level, chunk_count
      FROM knowledge_base WHERE id = '8c3e1fa7-d082-41d3-84ad-db253796b57c'
    `)
    console.log('\n📊 KB:', vKb.rows[0])

    const vChunks = await client.query(`
      SELECT COUNT(*) as count, metadata->>'normLevel' as norm_level
      FROM knowledge_base_chunks
      WHERE knowledge_base_id = '8c3e1fa7-d082-41d3-84ad-db253796b57c'
      GROUP BY norm_level
    `)
    console.log('📊 Chunks par normLevel:', vChunks.rows)

    const vCron = await client.query(`
      SELECT cron_name, cron_expression, is_active
      FROM cron_schedules WHERE cron_name = 'iort-constitution-refresh'
    `)
    console.log('📊 Cron:', vCron.rows[0])

    console.log('\n✅ Tous les fixes appliqués avec succès!')
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(err => {
  console.error('❌ Erreur:', err.message)
  process.exit(1)
})
