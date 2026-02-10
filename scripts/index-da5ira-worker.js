/**
 * Worker d'indexation da5ira - JavaScript pur (pas de TypeScript)
 * À copier dans /opt/moncabinet/scripts/ et exécuter avec node
 *
 * Usage (sur VPS):
 *   cd /opt/moncabinet
 *   docker exec -w /app qadhya-nextjs node scripts/index-da5ira-worker.js
 */

const SOURCE_ID = 'a7fc89a8-8f4f-4aaa-ae5e-cc87c2547bbf';

// Fonction principale
async function indexDa5ira() {
  console.log('=== INDEXATION DA5IRA.COM ===\n');

  try {
    // Import dynamique du service (ES modules)
    const { indexSourcePages } = await import('./lib/web-scraper/web-indexer-service.js');
    const { db } = await import('./lib/db/postgres.js');

    // 1. État initial
    console.log('1. Vérification état...');
    const stats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_indexed = false AND status IN ('crawled', 'unchanged') AND word_count >= 100) as a_indexer,
        COUNT(*) FILTER (WHERE is_indexed = true) as deja_indexes
      FROM web_pages
      WHERE web_source_id = $1
    `, [SOURCE_ID]);

    const { a_indexer, deja_indexes } = stats.rows[0];
    console.log(`   À indexer: ${a_indexer} pages`);
    console.log(`   Déjà indexées: ${deja_indexes} pages\n`);

    if (parseInt(a_indexer) === 0) {
      console.log('✅ Aucune page à indexer !');
      return;
    }

    // 2. Indexation
    console.log('2. Indexation en cours (limite: 250 pages)...');
    const start = Date.now();

    const result = await indexSourcePages(SOURCE_ID, {
      limit: 250,
      reindex: false
    });

    const duration = ((Date.now() - start) / 1000 / 60).toFixed(1);

    // 3. Résultats
    console.log(`\n✅ Terminé en ${duration} min`);
    console.log(`   Traitées: ${result.processed}`);
    console.log(`   Succès: ${result.succeeded}`);
    console.log(`   Échecs: ${result.failed}`);

    // 4. État final
    const finalStats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_indexed = true) as indexed,
        COUNT(*) FILTER (WHERE is_indexed = false AND status IN ('crawled', 'unchanged') AND word_count >= 100) as restant
      FROM web_pages
      WHERE web_source_id = $1
    `, [SOURCE_ID]);

    const { indexed, restant } = finalStats.rows[0];
    console.log(`\nÉtat final:`);
    console.log(`   Indexées: ${indexed}`);
    console.log(`   Restantes: ${restant}\n`);

    if (parseInt(restant) > 0) {
      console.log('⚠️  Relancez pour continuer.');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Erreur:', error.message || error);
    console.error(error.stack);
    process.exit(1);
  }
}

indexDa5ira();
