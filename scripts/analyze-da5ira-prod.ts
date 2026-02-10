#!/usr/bin/env tsx

/**
 * Analyse indexation da5ira.com en PRODUCTION
 * Via tunnel SSH port 5434
 */

import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5434, // Tunnel SSH vers production
  database: 'qadhya',
  user: 'moncabinet',
  password: 'prod_secure_password_2026',
  keepAlive: true,
});

async function analyzeDa5iraProd() {
  try {
    console.log('=== ANALYSE INDEXATION DA5IRA.COM (PRODUCTION) ===\n');

    // 1. Identifier la source
    const sourceQuery = await pool.query(`
      SELECT
        id,
        name,
        base_url,
        category,
        use_sitemap,
        requires_javascript,
        excluded_patterns
      FROM web_sources
      WHERE base_url ILIKE '%da5ira%' OR name ILIKE '%da5ira%'
    `);

    if (sourceQuery.rows.length === 0) {
      console.log('❌ Source da5ira non trouvée en production');
      return;
    }

    const source = sourceQuery.rows[0];
    console.log('✓ Source trouvée:', source.name, `(ID: ${source.id})`);
    console.log('  Base URL:', source.base_url);
    console.log('  Catégorie:', source.category);
    console.log('  Sitemap:', source.use_sitemap ? '✓' : '✗');
    console.log('  JavaScript:', source.requires_javascript ? '✓' : '✗');
    console.log('');

    // 2. Distribution des statuts
    const statusQuery = await pool.query(`
      SELECT
        COUNT(CASE WHEN status = 'crawled' THEN 1 END) as crawled,
        COUNT(CASE WHEN status = 'unchanged' THEN 1 END) as unchanged,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as errors,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN is_indexed = true THEN 1 END) as indexed,
        COUNT(*) as total_pages,
        AVG(word_count) FILTER (WHERE word_count > 0) as avg_words,
        COUNT(CASE WHEN word_count >= 100 THEN 1 END) as pages_with_content
      FROM web_pages
      WHERE web_source_id = $1
    `, [source.id]);

    console.log('1. STATISTIQUES GLOBALES:');
    const stats = statusQuery.rows[0];
    console.log(`   Total pages: ${stats.total_pages}`);
    console.log(`   - Crawled: ${stats.crawled}`);
    console.log(`   - Unchanged: ${stats.unchanged}`);
    console.log(`   - Errors: ${stats.errors}`);
    console.log(`   - Failed: ${stats.failed}`);
    console.log(`   - INDEXÉES: ${stats.indexed} (${((stats.indexed / stats.total_pages) * 100).toFixed(1)}%)`);
    console.log(`   Mots moyens: ${stats.avg_words ? parseInt(stats.avg_words) : 0}`);
    console.log(`   Pages avec contenu (≥100 mots): ${stats.pages_with_content}`);
    console.log('');

    // 3. Pages crawlées/unchanged NON indexées
    const unindexedCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM web_pages
      WHERE web_source_id = $1
        AND is_indexed = false
        AND status IN ('crawled', 'unchanged')
        AND word_count >= 100
    `, [source.id]);

    console.log(`2. PAGES NON INDEXÉES AVEC CONTENU:`);
    console.log(`   ${unindexedCount.rows[0].count} pages crawlées/unchanged non indexées avec ≥100 mots`);
    console.log('');

    // 4. Patterns d'URLs
    const patternsQuery = await pool.query(`
      SELECT
        CASE
          WHEN url LIKE '%?m=1%' THEN 'Mobile (m=1)'
          WHEN url LIKE '%#%' THEN 'Ancre (#)'
          WHEN url LIKE '%?showComment=%' THEN 'Commentaire'
          WHEN url LIKE '%/search/label/%' THEN 'Catégorie'
          WHEN url ~ '/[0-9]{4}/[0-9]{2}/.+\.html$' THEN 'Article standard'
          ELSE 'Autre'
        END as pattern,
        COUNT(*) as count,
        COUNT(CASE WHEN is_indexed = true THEN 1 END) as indexed
      FROM web_pages
      WHERE web_source_id = $1
      GROUP BY pattern
      ORDER BY count DESC
    `, [source.id]);

    console.log('3. PATTERNS D\'URLS:');
    console.table(patternsQuery.rows);
    console.log('');

    // 5. Exemples pages non indexées avec contenu
    const examplesQuery = await pool.query(`
      SELECT
        url,
        status,
        word_count,
        last_crawled_at::date as derniere_crawl,
        error_message
      FROM web_pages
      WHERE web_source_id = $1
        AND is_indexed = false
        AND status IN ('crawled', 'unchanged')
        AND word_count >= 100
      ORDER BY word_count DESC
      LIMIT 10
    `, [source.id]);

    console.log('4. TOP 10 PAGES NON INDEXÉES (avec contenu):');
    console.table(examplesQuery.rows);
    console.log('');

    // 6. Jobs d'indexation
    const jobsQuery = await pool.query(`
      SELECT
        id,
        status,
        total_documents,
        processed_documents,
        failed_documents,
        started_at::timestamp as started,
        completed_at::timestamp as completed,
        EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at)) / 60 as duree_minutes
      FROM indexing_jobs
      WHERE web_source_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [source.id]);

    console.log('5. JOBS D\'INDEXATION RÉCENTS:');
    if (jobsQuery.rows.length === 0) {
      console.log('   ❌ Aucun job d\'indexation trouvé pour cette source');
    } else {
      console.table(jobsQuery.rows);
    }
    console.log('');

    // 7. Recommandations
    console.log('=== DIAGNOSTIC ===');
    const pagesAIndexer = parseInt(unindexedCount.rows[0].count);

    if (pagesAIndexer > 0) {
      console.log(`✓ Cause identifiée: ${pagesAIndexer} pages crawlées avec contenu mais NON indexées`);

      if (jobsQuery.rows.length === 0) {
        console.log('✓ Pas de job d\'indexation → Aucun déclenchement automatique effectué');
      } else {
        const lastJob = jobsQuery.rows[0];
        console.log(`✓ Dernier job: ${lastJob.status} - ${lastJob.processed_documents}/${lastJob.total_documents} pages`);
      }

      console.log('\n=== SOLUTION ===');
      console.log(`Déclencher indexation manuelle via API:`);
      console.log(`curl -X POST https://qadhya.tn/api/admin/web-sources/${source.id}/index \\`);
      console.log(`     -H "Content-Type: application/json" \\`);
      console.log(`     -H "Cookie: [ADMIN_SESSION]"`);
      console.log(`\nOu via l'interface web: https://qadhya.tn/super-admin/web-sources/${source.id}`);
    } else {
      console.log('✓ Toutes les pages avec contenu sont indexées');
      console.log(`⚠️  ${stats.total_pages - stats.indexed} pages non indexées probablement sans contenu ou inutiles`);
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await pool.end();
  }
}

analyzeDa5iraProd();
