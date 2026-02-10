#!/usr/bin/env tsx

/**
 * Déclenchement indexation manuelle da5ira.com en production
 * API: POST /api/admin/web-sources/{id}/index
 */

import { Pool } from 'pg';

const SOURCE_ID = 'a7fc89a8-8f4f-4aaa-ae5e-cc87c2547bbf';
const API_ENDPOINT = `https://qadhya.tn/api/admin/web-sources/${SOURCE_ID}/index`;

// Pool pour monitoring progression via tunnel SSH
const pool = new Pool({
  host: 'localhost',
  port: 5434,
  database: 'qadhya',
  user: 'moncabinet',
  password: 'prod_secure_password_2026',
  keepAlive: true,
});

async function triggerIndexing() {
  console.log('=== DÉCLENCHEMENT INDEXATION DA5IRA.COM ===\n');

  try {
    // 1. État initial
    console.log('1. État initial:');
    const initialState = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_indexed = false AND status IN ('crawled', 'unchanged') AND word_count >= 100) as a_indexer,
        COUNT(*) FILTER (WHERE is_indexed = true) as deja_indexes
      FROM web_pages
      WHERE web_source_id = $1
    `, [SOURCE_ID]);

    const { a_indexer, deja_indexes } = initialState.rows[0];
    console.log(`   Pages à indexer: ${a_indexer}`);
    console.log(`   Déjà indexées: ${deja_indexes}`);
    console.log('');

    // 2. Déclencher indexation via SSH (exécution côté serveur)
    console.log('2. Déclenchement indexation...');
    console.log('   Note: L\'indexation se fait en background avec Ollama');
    console.log(`   Endpoint: POST /api/admin/web-sources/${SOURCE_ID}/index`);
    console.log('');

    // Utiliser curl via SSH pour déclencher l'API en interne
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const curlCommand = `ssh root@84.247.165.187 "docker exec qadhya-nextjs curl -X POST http://localhost:3000/api/admin/web-sources/${SOURCE_ID}/index -H 'Content-Type: application/json' -w '\\nHTTP Status: %{http_code}\\n'"`;

    console.log('   Exécution de la requête API...');
    const { stdout, stderr } = await execAsync(curlCommand, { timeout: 30000 });

    if (stderr && !stderr.includes('Total received')) {
      console.log('   ⚠️  Erreur:', stderr);
    }

    console.log('   Réponse API:');
    console.log(stdout);
    console.log('');

    // 3. Monitoring progression (toutes les 30 secondes)
    console.log('3. Monitoring de la progression:');
    console.log('   (Ctrl+C pour arrêter le monitoring, indexation continuera en background)');
    console.log('');

    let previousIndexed = parseInt(deja_indexes);
    let iteration = 0;
    const maxIterations = 40; // 40 * 30s = 20 minutes max

    const monitoringInterval = setInterval(async () => {
      try {
        iteration++;

        const progressQuery = await pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE is_indexed = true) as indexed,
            COUNT(*) FILTER (WHERE is_indexed = false AND status IN ('crawled', 'unchanged') AND word_count >= 100) as restant
          FROM web_pages
          WHERE web_source_id = $1
        `, [SOURCE_ID]);

        const { indexed, restant } = progressQuery.rows[0];
        const newlyIndexed = parseInt(indexed) - previousIndexed;
        const progress = ((parseInt(indexed) / (parseInt(indexed) + parseInt(restant))) * 100).toFixed(1);

        const timestamp = new Date().toLocaleTimeString('fr-FR');
        console.log(`   [${timestamp}] Indexées: ${indexed} (+${newlyIndexed}) | Restant: ${restant} | Progrès: ${progress}%`);

        if (parseInt(restant) === 0) {
          console.log('\n✅ INDEXATION TERMINÉE !');
          console.log(`   Total indexé: ${indexed} pages`);
          clearInterval(monitoringInterval);
          await pool.end();
          process.exit(0);
        }

        if (iteration >= maxIterations) {
          console.log('\n⏱️  Timeout monitoring (20 minutes)');
          console.log(`   État: ${indexed} indexées, ${restant} restantes`);
          console.log('   L\'indexation continue en background, vérifiez plus tard.');
          clearInterval(monitoringInterval);
          await pool.end();
          process.exit(0);
        }

        previousIndexed = parseInt(indexed);

      } catch (error) {
        console.error('   Erreur monitoring:', error instanceof Error ? error.message : error);
      }
    }, 30000); // Toutes les 30 secondes

    // Première vérification après 10 secondes
    setTimeout(async () => {
      const initialCheck = await pool.query(`
        SELECT COUNT(*) FILTER (WHERE is_indexed = true) as indexed
        FROM web_pages
        WHERE web_source_id = $1
      `, [SOURCE_ID]);

      console.log(`   [${new Date().toLocaleTimeString('fr-FR')}] Première vérification: ${initialCheck.rows[0].indexed} indexées`);
    }, 10000);

  } catch (error) {
    console.error('❌ Erreur:', error);
    await pool.end();
    process.exit(1);
  }
}

// Gestion Ctrl+C
process.on('SIGINT', async () => {
  console.log('\n\n⏸️  Monitoring arrêté (indexation continue en background)');
  await pool.end();
  process.exit(0);
});

triggerIndexing();
