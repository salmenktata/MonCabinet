#!/usr/bin/env tsx

/**
 * Script d'analyse de l'indexation da5ira.com
 * Identifie pourquoi 258 pages crawlées mais seulement 3 indexées
 */

import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'moncabinet',
  user: 'moncabinet',
  password: 'dev_password_change_in_production',
});

async function analyzeDa5iraIndexing() {
  try {
    console.log('=== ANALYSE INDEXATION DA5IRA.COM ===\n');

    // 1. Distribution des statuts
    const statusQuery = await pool.query(`
      SELECT
        ws.name,
        ws.base_url,
        COUNT(CASE WHEN wp.status = 'crawled' THEN 1 END) as crawled,
        COUNT(CASE WHEN wp.status = 'unchanged' THEN 1 END) as unchanged,
        COUNT(CASE WHEN wp.status = 'error' THEN 1 END) as errors,
        COUNT(CASE WHEN wp.is_indexed = true THEN 1 END) as indexed,
        COUNT(*) as total_pages
      FROM web_sources ws
      LEFT JOIN web_pages wp ON wp.web_source_id = ws.id
      WHERE ws.base_url LIKE '%da5ira%'
      GROUP BY ws.id, ws.name, ws.base_url
    `);

    console.log('1. DISTRIBUTION DES STATUTS:');
    console.table(statusQuery.rows);

    // 2. Pages non indexées avec contenu
    const unindexedQuery = await pool.query(`
      SELECT
        wp.url,
        wp.status,
        wp.is_indexed,
        wp.word_count,
        LENGTH(wp.content) as content_length,
        wp.last_crawled_at,
        SUBSTRING(wp.error_message, 1, 100) as error_msg
      FROM web_sources ws
      JOIN web_pages wp ON wp.web_source_id = ws.id
      WHERE ws.base_url LIKE '%da5ira%'
        AND wp.is_indexed = false
        AND wp.status IN ('crawled', 'unchanged')
      ORDER BY wp.word_count DESC NULLS LAST
      LIMIT 15
    `);

    console.log('\n2. TOP 15 PAGES NON INDEXÉES (avec contenu):');
    console.table(unindexedQuery.rows);

    // 3. Statistiques contenu
    const contentStatsQuery = await pool.query(`
      SELECT
        AVG(wp.word_count) as avg_words,
        MIN(wp.word_count) as min_words,
        MAX(wp.word_count) as max_words,
        COUNT(CASE WHEN wp.word_count >= 100 THEN 1 END) as pages_with_content,
        COUNT(CASE WHEN wp.word_count < 100 OR wp.word_count IS NULL THEN 1 END) as pages_low_content
      FROM web_sources ws
      JOIN web_pages wp ON wp.web_source_id = ws.id
      WHERE ws.base_url LIKE '%da5ira%'
        AND wp.is_indexed = false
        AND wp.status IN ('crawled', 'unchanged')
    `);

    console.log('\n3. STATISTIQUES CONTENU (pages non indexées):');
    console.table(contentStatsQuery.rows);

    // 4. Exemples d'URLs crawlées
    const urlPatternsQuery = await pool.query(`
      SELECT
        CASE
          WHEN wp.url LIKE '%?m=1%' THEN 'Mobile (m=1)'
          WHEN wp.url LIKE '%#%' THEN 'Ancre (#)'
          WHEN wp.url LIKE '%?showComment=%' THEN 'Commentaire'
          WHEN wp.url LIKE '%/search/label/%' THEN 'Catégorie'
          WHEN wp.url ~ '/[0-9]{4}/[0-9]{2}/.+\.html$' THEN 'Article standard'
          ELSE 'Autre'
        END as url_pattern,
        COUNT(*) as count
      FROM web_sources ws
      JOIN web_pages wp ON wp.web_source_id = ws.id
      WHERE ws.base_url LIKE '%da5ira%'
      GROUP BY url_pattern
      ORDER BY count DESC
    `);

    console.log('\n4. PATTERNS D\'URLS CRAWLÉES:');
    console.table(urlPatternsQuery.rows);

    // 5. Vérifier si des jobs d'indexation sont bloqués
    const indexingJobsQuery = await pool.query(`
      SELECT
        ij.id,
        ij.status,
        ij.total_documents,
        ij.processed_documents,
        ij.failed_documents,
        ij.started_at,
        ij.completed_at,
        EXTRACT(EPOCH FROM (NOW() - ij.started_at)) / 60 as minutes_running
      FROM indexing_jobs ij
      JOIN web_sources ws ON ij.source_id = ws.id
      WHERE ws.base_url LIKE '%da5ira%'
      ORDER BY ij.created_at DESC
      LIMIT 5
    `);

    console.log('\n5. JOBS D\'INDEXATION RÉCENTS:');
    console.table(indexingJobsQuery.rows);

    // 6. Recommandations
    console.log('\n=== RECOMMANDATIONS ===');
    const stats = statusQuery.rows[0];
    const unindexedCount = stats.total_pages - stats.indexed;
    const crawledAndUnchanged = stats.crawled + stats.unchanged;

    if (unindexedCount > 0 && crawledAndUnchanged > stats.indexed) {
      console.log(`✓ ${unindexedCount} pages crawlées non indexées détectées`);
      console.log(`✓ Action suggérée: Déclencher indexation manuelle via API`);
      console.log(`\n  Commande:`);
      console.log(`  curl -X POST http://localhost:3000/api/admin/web-sources/[SOURCE_ID]/index \\`);
      console.log(`       -H "Content-Type: application/json"`);
    }

    const contentStats = contentStatsQuery.rows[0];
    if (contentStats.pages_low_content > contentStats.pages_with_content * 0.5) {
      console.log(`\n⚠️  Beaucoup de pages avec peu de contenu (${contentStats.pages_low_content} pages < 100 mots)`);
      console.log(`   Considérer ajouter des filtres d'exclusion pour URLs non pertinentes`);
    }

  } catch (error) {
    console.error('Erreur lors de l\'analyse:', error);
  } finally {
    await pool.end();
  }
}

analyzeDa5iraIndexing();
