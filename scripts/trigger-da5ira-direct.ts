/**
 * Script à exécuter dans le container Next.js pour indexer da5ira
 * Ne nécessite pas d'authentification car appelle directement les services
 *
 * Usage (sur VPS):
 *   docker exec qadhya-nextjs npx tsx /app/scripts/trigger-da5ira-direct.ts
 */

const SOURCE_ID = 'a7fc89a8-8f4f-4aaa-ae5e-cc87c2547bbf';

async function main() {
  console.log('=== INDEXATION DIRECTE DA5IRA.COM ===\n');

  try {
    // Importer le service d'indexation
    const { indexSourcePages } = await import('../lib/web-scraper/web-indexer-service');
    const { db } = await import('../lib/db/postgres');

    // 1. État initial
    console.log('1. État initial:');
    const statsResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_indexed = false AND status IN ('crawled', 'unchanged') AND word_count >= 100) as a_indexer,
        COUNT(*) FILTER (WHERE is_indexed = true) as deja_indexes
      FROM web_pages
      WHERE web_source_id = $1
    `, [SOURCE_ID]);

    const stats = statsResult.rows[0];
    console.log(`   Pages à indexer: ${stats.a_indexer}`);
    console.log(`   Déjà indexées: ${stats.deja_indexes}`);
    console.log('');

    if (parseInt(stats.a_indexer) === 0) {
      console.log('✅ Toutes les pages sont déjà indexées !');
      return;
    }

    // 2. Lancer l'indexation
    console.log('2. Indexation en cours...');
    console.log(`   Limite: 250 pages par batch`);
    console.log(`   Mode: index nouvelles pages uniquement`);
    console.log('');

    const startTime = Date.now();

    const result = await indexSourcePages(SOURCE_ID, {
      limit: 250,
      reindex: false
    });

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    // 3. Résultats
    console.log('');
    console.log('=== RÉSULTATS ===');
    console.log(`✅ Indexation terminée en ${duration} minutes`);
    console.log(`   Pages traitées: ${result.processed}`);
    console.log(`   Succès: ${result.succeeded}`);
    console.log(`   Échecs: ${result.failed}`);
    console.log('');

    // 4. État final
    const finalStats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_indexed = true) as indexed,
        COUNT(*) FILTER (WHERE is_indexed = false AND status IN ('crawled', 'unchanged') AND word_count >= 100) as restant
      FROM web_pages
      WHERE web_source_id = $1
    `, [SOURCE_ID]);

    const final = finalStats.rows[0];
    console.log('État final:');
    console.log(`   Indexées: ${final.indexed} pages`);
    console.log(`   Restantes: ${final.restant} pages`);

    if (parseInt(final.restant) > 0) {
      console.log('');
      console.log('⚠️  Il reste des pages à indexer.');
      console.log('   Relancez le script pour continuer l\'indexation.');
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

main();
