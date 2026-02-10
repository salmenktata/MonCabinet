#!/usr/bin/env tsx

/**
 * Script pour déclencher un crawl manuel de 9anoun.tn
 *
 * Usage:
 *   npx tsx scripts/trigger-crawl-9anoun.ts
 *
 * Prérequis:
 *   - Variable CRON_SECRET définie dans .env
 */

import { Pool } from 'pg';

const PROD_DB_CONFIG = {
  host: 'localhost',
  port: 5434, // Tunnel SSH vers prod
  database: 'qadhya',
  user: 'moncabinet',
  password: process.env.DB_PASSWORD || 'moncabinet',
  connectionTimeoutMillis: 10000,
  keepAlive: true,
};

const SOURCE_ID = '4319d2d1-569c-4107-8f52-d71e2a2e9fe9'; // ID de 9anoun.tn

async function triggerCrawl() {
  console.log('\n🚀 Déclenchement d\'un crawl manuel de 9anoun.tn\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const pool = new Pool(PROD_DB_CONFIG);

  try {
    // Vérifier l'état actuel
    console.log('📊 État actuel de la source...\n');

    const sourceQuery = await pool.query(`
      SELECT
        name,
        base_url,
        is_active,
        health_status,
        last_crawl_at,
        next_crawl_at,
        total_pages_discovered,
        total_pages_indexed
      FROM web_sources
      WHERE id = $1
    `, [SOURCE_ID]);

    if (sourceQuery.rows.length === 0) {
      console.error('❌ Source 9anoun.tn non trouvée');
      return;
    }

    const source = sourceQuery.rows[0];
    console.log(`   Nom: ${source.name}`);
    console.log(`   URL: ${source.base_url}`);
    console.log(`   Active: ${source.is_active ? '✅' : '❌'}`);
    console.log(`   Santé: ${source.health_status}`);
    console.log(`   Dernier crawl: ${source.last_crawl_at?.toISOString() || 'Jamais'}`);
    console.log(`   Prochain crawl: ${source.next_crawl_at?.toISOString() || 'Non planifié'}`);
    console.log(`   Pages découvertes: ${source.total_pages_discovered}`);
    console.log(`   Pages indexées: ${source.total_pages_indexed}\n`);

    // Compter les pages en attente
    const pendingQuery = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE url LIKE '%code-obligations-contrats%') as coc_total,
        COUNT(*) FILTER (WHERE url LIKE '%code-obligations-contrats%' AND status = 'pending') as coc_pending
      FROM web_pages
      WHERE web_source_id = $1
    `, [SOURCE_ID]);

    const stats = pendingQuery.rows[0];
    console.log('📋 Pages en attente de crawl:\n');
    console.log(`   Total pending: ${stats.pending}`);
    console.log(`   COC total: ${stats.coc_total}`);
    console.log(`   COC pending: ${stats.coc_pending}\n`);

    if (stats.coc_pending === 0) {
      console.log('⚠️  Aucune page COC en attente de crawl');
      console.log('   Exécuter d\'abord le script de découverte:\n');
      console.log('   npm run discover:coc\n');
      return;
    }

    // Forcer le prochain crawl maintenant
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⏰ Mise à jour du planning de crawl...\n');

    await pool.query(`
      UPDATE web_sources
      SET
        next_crawl_at = NOW(),
        scheduler_skip_until = NULL,
        last_scheduler_error = NULL,
        updated_at = NOW()
      WHERE id = $1
    `, [SOURCE_ID]);

    console.log('✅ Crawl planifié immédiatement\n');

    // Vérifier si un job est déjà en cours
    const jobQuery = await pool.query(`
      SELECT id, status, started_at, completed_at
      FROM crawl_jobs
      WHERE web_source_id = $1
        AND status IN ('pending', 'running')
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (jobQuery.rows.length > 0) {
      const job = jobQuery.rows[0];
      console.log('ℹ️  Un job de crawl est déjà en cours:');
      console.log(`   ID: ${job.id}`);
      console.log(`   Statut: ${job.status}`);
      console.log(`   Démarré: ${job.started_at?.toISOString() || 'Non démarré'}\n`);
      console.log('   Le crawl va inclure les nouvelles pages COC.\n');
    } else {
      console.log('ℹ️  Un nouveau job sera créé par le scheduler au prochain cycle (1-5 min)\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📡 Monitoring du crawl:\n');
    console.log('1. Via les logs Docker:');
    console.log('   ssh root@84.247.165.187 "docker logs -f qadhya-nextjs | grep -E \'9anoun|COC\'"\n');
    console.log('2. Via l\'interface admin:');
    console.log('   https://qadhya.tn/super-admin/web-sources\n');
    console.log('3. Via la base de données:');
    console.log(`   SELECT * FROM crawl_jobs WHERE web_source_id = '${SOURCE_ID}' ORDER BY created_at DESC LIMIT 5;\n`);

  } catch (error) {
    console.error('❌ Erreur:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    throw error;
  } finally {
    await pool.end();
    console.log('🔌 Connexion fermée\n');
  }
}

// Point d'entrée
async function main() {
  try {
    await triggerCrawl();
    console.log('✅ Crawl déclenché avec succès !\n');
  } catch (error) {
    console.error('\n❌ Le script a échoué');
    process.exit(1);
  }
}

main();
