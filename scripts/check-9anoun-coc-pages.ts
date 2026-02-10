#!/usr/bin/env tsx

/**
 * Script pour vérifier toutes les pages du Code des Obligations et Contrats (COC) sur 9anoun.tn
 */

import { Pool } from 'pg';

const PROD_DB_CONFIG = {
  host: 'localhost',
  port: 5434, // Tunnel SSH vers prod
  database: 'qadhya',
  user: 'moncabinet',
  password: process.env.DB_PASSWORD || 'moncabinet',
  // Options de connexion plus robustes
  connectionTimeoutMillis: 10000,
  query_timeout: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

async function checkCOCPages() {
  const pool = new Pool(PROD_DB_CONFIG);

  try {
    console.log('\n🔍 Vérification des pages Code des Obligations et Contrats (9anoun.tn)');
    console.log('📡 Connexion à la base de production...\n');

    // Test de connexion
    await pool.query('SELECT NOW()');
    console.log('✅ Connexion établie\n');

    // 1. Trouver la source web pour 9anoun.tn
    const sourceQuery = await pool.query(`
      SELECT id, name, base_url, category, status, created_at
      FROM web_sources
      WHERE base_url LIKE '%9anoun.tn%'
      LIMIT 1
    `);

    if (sourceQuery.rows.length === 0) {
      console.log('❌ Aucune source web trouvée pour 9anoun.tn');
      return;
    }

    const source = sourceQuery.rows[0];
    console.log('✅ Source trouvée:');
    console.log(`   ID: ${source.id}`);
    console.log(`   Nom: ${source.name}`);
    console.log(`   URL de base: ${source.base_url}`);
    console.log(`   Statut: ${source.status}\n`);

    // 2. Chercher TOUTES les pages liées au Code des Obligations et Contrats
    console.log('🔍 Recherche des pages COC...\n');

    const pagesQuery = await pool.query(`
      SELECT
        id,
        url,
        title,
        status,
        word_count,
        is_indexed,
        created_at,
        last_crawled_at
      FROM web_pages
      WHERE source_id = $1
        AND (
          url LIKE '%code-obligations-contrats%'
          OR url LIKE '%COC%'
          OR title LIKE '%Code des Obligations%'
          OR title LIKE '%مجلة الالتزامات%'
        )
      ORDER BY url
    `, [source.id]);

    if (pagesQuery.rows.length === 0) {
      console.log('❌ Aucune page COC trouvée\n');

      // Chercher des exemples de pages crawlées
      const sampleQuery = await pool.query(`
        SELECT url, title, status
        FROM web_pages
        WHERE source_id = $1
        LIMIT 10
      `, [source.id]);

      if (sampleQuery.rows.length > 0) {
        console.log('📄 Exemples de pages crawlées sur 9anoun.tn:');
        sampleQuery.rows.forEach((page, idx) => {
          console.log(`   ${idx + 1}. ${page.url}`);
        });
      }
    } else {
      console.log(`✅ ${pagesQuery.rows.length} page(s) COC trouvée(s):\n`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // Grouper par statut
      const byStatus = pagesQuery.rows.reduce((acc, page) => {
        const status = page.status || 'unknown';
        if (!acc[status]) acc[status] = [];
        acc[status].push(page);
        return acc;
      }, {} as Record<string, any[]>);

      for (const [status, pages] of Object.entries(byStatus) as [string, any[]][]) {
        const statusIcon = {
          'crawled': '✅',
          'unchanged': '🔄',
          'failed': '❌',
          'pending': '⏳'
        }[status] || '❓';

        console.log(`${statusIcon} ${status.toUpperCase()} (${pages.length}):`)
        console.log('');

        for (const page of pages) {
          const indexIcon = page.is_indexed ? '✅' : '❌';
          const words = page.word_count || 0;

          console.log(`   ${indexIcon} ${page.title || 'Sans titre'}`);
          console.log(`      URL: ${page.url}`);
          console.log(`      Mots: ${words} | Indexée: ${page.is_indexed ? 'OUI' : 'NON'}`);
          console.log(`      Crawlée: ${page.last_crawled_at?.toISOString().split('T')[0] || 'Jamais'}`);
          console.log('');
        }
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // Stats
      const totalIndexed = pagesQuery.rows.filter(p => p.is_indexed).length;
      const totalWords = pagesQuery.rows.reduce((sum, p) => sum + (p.word_count || 0), 0);

      console.log('📊 Résumé:');
      console.log(`   Total pages COC: ${pagesQuery.rows.length}`);
      console.log(`   Pages indexées: ${totalIndexed} (${Math.round(totalIndexed / pagesQuery.rows.length * 100)}%)`);
      console.log(`   Total mots: ${totalWords.toLocaleString()}`);
      console.log(`   Mots/page moyen: ${Math.round(totalWords / pagesQuery.rows.length)}`);

      // Vérifier les chunks RAG pour les pages indexées
      if (totalIndexed > 0) {
        const indexedIds = pagesQuery.rows
          .filter(p => p.is_indexed)
          .map(p => p.id.toString());

        const chunksQuery = await pool.query(`
          SELECT
            COUNT(*) as total_chunks,
            AVG(LENGTH(content)) as avg_chunk_size,
            MIN(LENGTH(content)) as min_chunk_size,
            MAX(LENGTH(content)) as max_chunk_size
          FROM rag_chunks
          WHERE metadata->>'web_page_id' = ANY($1)
        `, [indexedIds]);

        if (chunksQuery.rows[0].total_chunks > 0) {
          console.log('\n📦 Chunks RAG:');
          console.log(`   Total chunks: ${chunksQuery.rows[0].total_chunks}`);
          console.log(`   Taille moyenne: ${Math.round(chunksQuery.rows[0].avg_chunk_size)} chars`);
          console.log(`   Min/Max: ${chunksQuery.rows[0].min_chunk_size} / ${chunksQuery.rows[0].max_chunk_size} chars`);
        }
      }
    }

    // 3. Stats globales 9anoun.tn
    const statsQuery = await pool.query(`
      SELECT
        COUNT(*) as total_pages,
        COUNT(*) FILTER (WHERE status = 'crawled') as crawled,
        COUNT(*) FILTER (WHERE status = 'unchanged') as unchanged,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE is_indexed = true) as indexed,
        SUM(word_count) as total_words
      FROM web_pages
      WHERE source_id = $1
    `, [source.id]);

    const stats = statsQuery.rows[0];
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📊 Statistiques globales 9anoun.tn:');
    console.log(`   Total pages: ${stats.total_pages}`);
    console.log(`   Crawlées: ${stats.crawled}`);
    console.log(`   Inchangées: ${stats.unchanged}`);
    console.log(`   Échouées: ${stats.failed}`);
    console.log(`   Indexées: ${stats.indexed} (${Math.round(stats.indexed / stats.total_pages * 100)}%)`);
    console.log(`   Total mots: ${(stats.total_words || 0).toLocaleString()}`);
    console.log('');

  } catch (error) {
    console.error('❌ Erreur:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);

      if (error.message.includes('ECONNREFUSED') || error.message.includes('ECONNRESET')) {
        console.error('\n💡 Problème de connexion. Vérifications:');
        console.error('   1. Tunnel SSH actif ? ps aux | grep "5434.*84.247.165.187"');
        console.error('   2. Recréer le tunnel : ssh -f -N -L 5434:localhost:5432 root@84.247.165.187');
        console.error('   3. PostgreSQL actif sur le VPS ? ssh root@84.247.165.187 "systemctl status postgresql"');
      }
    }
  } finally {
    await pool.end();
    console.log('🔌 Connexion fermée\n');
  }
}

checkCOCPages();
