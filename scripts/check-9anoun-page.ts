#!/usr/bin/env tsx

/**
 * Script pour vérifier si une page 9anoun.tn a été crawlée en production
 */

import { Pool } from 'pg';

const PROD_DB_CONFIG = {
  host: 'localhost',
  port: 5434, // Tunnel SSH vers prod
  database: 'qadhya',
  user: 'moncabinet',
  password: process.env.DB_PASSWORD || 'moncabinet',
};

async function checkPage(url: string) {
  const pool = new Pool(PROD_DB_CONFIG);

  try {
    console.log('\n🔍 Vérification de la page:', url);
    console.log('📡 Connexion à la base de production...\n');

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
    console.log(`   Catégorie: ${source.category}`);
    console.log(`   Statut: ${source.status}\n`);

    // 2. Chercher la page spécifique
    const pageQuery = await pool.query(`
      SELECT
        id,
        url,
        title,
        status,
        word_count,
        is_indexed,
        created_at,
        updated_at,
        last_crawled_at
      FROM web_pages
      WHERE url = $1 OR url LIKE $2
      LIMIT 5
    `, [url, `%${url.split('/').pop()}%`]);

    if (pageQuery.rows.length === 0) {
      console.log('❌ Page non trouvée dans web_pages');
      console.log('\n💡 Suggestions:');
      console.log('   1. La page n\'a peut-être pas encore été crawlée');
      console.log('   2. L\'URL peut être légèrement différente');
      console.log('   3. Le crawler n\'a peut-être pas suivi ce lien\n');

      // Chercher des pages similaires
      const similarQuery = await pool.query(`
        SELECT url, title, status, word_count, is_indexed
        FROM web_pages
        WHERE source_id = $1
          AND url LIKE '%code-obligations-contrats%'
        LIMIT 3
      `, [source.id]);

      if (similarQuery.rows.length > 0) {
        console.log('📄 Pages similaires trouvées:');
        similarQuery.rows.forEach((page, idx) => {
          console.log(`\n   ${idx + 1}. ${page.title || 'Sans titre'}`);
          console.log(`      URL: ${page.url}`);
          console.log(`      Statut: ${page.status}`);
          console.log(`      Mots: ${page.word_count || 0}`);
          console.log(`      Indexée: ${page.is_indexed ? '✅' : '❌'}`);
        });
      }
    } else {
      console.log(`✅ ${pageQuery.rows.length} page(s) trouvée(s):\n`);

      for (const page of pageQuery.rows) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📄 Titre: ${page.title || 'Sans titre'}`);
        console.log(`🔗 URL: ${page.url}`);
        console.log(`📊 Statut de crawl: ${page.status}`);
        console.log(`📝 Nombre de mots: ${page.word_count || 0}`);
        console.log(`🔍 Indexée: ${page.is_indexed ? '✅ OUI' : '❌ NON'}`);
        console.log(`📅 Créée: ${page.created_at?.toISOString()}`);
        console.log(`📅 Dernière MAJ: ${page.updated_at?.toISOString()}`);
        console.log(`📅 Dernier crawl: ${page.last_crawled_at?.toISOString() || 'Jamais'}`);

        // Si indexée, chercher les chunks
        if (page.is_indexed) {
          const chunksQuery = await pool.query(`
            SELECT COUNT(*) as count, AVG(LENGTH(content)) as avg_size
            FROM rag_chunks
            WHERE metadata->>'web_page_id' = $1
          `, [page.id.toString()]);

          if (chunksQuery.rows[0].count > 0) {
            console.log(`\n📦 Chunks RAG: ${chunksQuery.rows[0].count}`);
            console.log(`📏 Taille moyenne: ${Math.round(chunksQuery.rows[0].avg_size)} caractères`);
          }
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
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
    console.log('\n📊 Statistiques globales 9anoun.tn:');
    console.log(`   Total pages: ${stats.total_pages}`);
    console.log(`   Crawlées: ${stats.crawled}`);
    console.log(`   Inchangées: ${stats.unchanged}`);
    console.log(`   Échouées: ${stats.failed}`);
    console.log(`   Indexées: ${stats.indexed}`);
    console.log(`   Total mots: ${stats.total_words || 0}`);

  } catch (error) {
    console.error('❌ Erreur:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);

      if (error.message.includes('ECONNREFUSED')) {
        console.error('\n💡 Tunnel SSH non actif. Créer le tunnel avec:');
        console.error('   ssh -f -N -L 5434:localhost:5432 root@84.247.165.187');
      }
    }
  } finally {
    await pool.end();
  }
}

// URL à vérifier
const targetUrl = 'https://9anoun.tn/kb/codes/code-obligations-contrats';
checkPage(targetUrl);
