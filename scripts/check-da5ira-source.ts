#!/usr/bin/env tsx

/**
 * Vérifier si la source da5ira existe et obtenir son ID
 */

import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  database: 'moncabinet',
  user: 'moncabinet',
  password: 'dev_password_change_in_production',
});

async function checkDa5iraSource() {
  try {
    // Chercher toutes les sources qui contiennent "da5ira" ou "5ira"
    const result = await pool.query(`
      SELECT
        id,
        name,
        base_url,
        category,
        (SELECT COUNT(*) FROM web_pages WHERE web_source_id = ws.id) as total_pages,
        (SELECT COUNT(*) FROM web_pages WHERE web_source_id = ws.id AND is_indexed = true) as indexed_pages
      FROM web_sources ws
      WHERE base_url ILIKE '%da5ira%' OR base_url ILIKE '%5ira%' OR name ILIKE '%da5ira%' OR name ILIKE '%5ira%'
    `);

    if (result.rows.length === 0) {
      console.log('❌ Aucune source contenant "da5ira" ou "5ira" trouvée dans la base de données locale.');
      console.log('\nRecherche de toutes les sources web disponibles:');

      const allSources = await pool.query(`
        SELECT
          id,
          name,
          base_url,
          (SELECT COUNT(*) FROM web_pages WHERE web_source_id = ws.id) as total_pages
        FROM web_sources ws
        ORDER BY name
      `);

      console.table(allSources.rows);
    } else {
      console.log('✅ Source(s) trouvée(s):');
      console.table(result.rows);
    }

  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    await pool.end();
  }
}

checkDa5iraSource();
