#!/usr/bin/env node

/**
 * Script d'application de la migration d'enrichissement des tribunaux
 * Alternative à l'exécution manuelle via psql
 *
 * Usage: node scripts/apply-tribunals-migration.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration depuis .env ou variables d'environnement
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function applyMigration() {
  console.log('\n🏛️  APPLICATION MIGRATION TRIBUNAUX');
  console.log('====================================\n');

  const migrationPath = path.join(__dirname, '..', 'db', 'migrations', '20260210100000_enrich_tribunals_taxonomy.sql');

  try {
    // Lire le fichier de migration
    console.log('📖 Lecture du fichier de migration...');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Se connecter à la base
    console.log('🔌 Connexion à la base de données...');
    const client = await pool.connect();

    try {
      // Commencer une transaction
      await client.query('BEGIN');

      console.log('⚙️  Exécution de la migration...\n');

      // Exécuter la migration
      const result = await client.query(migrationSQL);

      // Vérifier les résultats
      console.log('\n📊 VÉRIFICATIONS POST-MIGRATION\n');

      // Compter les tribunaux
      const tribunalsCount = await client.query(
        "SELECT COUNT(*) as count FROM legal_taxonomy WHERE type = 'tribunal' AND is_active = true"
      );
      console.log(`✅ Tribunaux totaux: ${tribunalsCount.rows[0].count} (attendu: 22)`);

      // Compter les cours d'appel
      const coursAppelCount = await client.query(
        "SELECT COUNT(*) as count FROM legal_taxonomy WHERE type = 'tribunal' AND code LIKE 'appel_%'"
      );
      console.log(`✅ Cours d'appel: ${coursAppelCount.rows[0].count} (attendu: 11)`);

      // Compter les nouveaux tribunaux
      const nouveauxCount = await client.query(`
        SELECT COUNT(*) as count FROM legal_taxonomy
        WHERE code IN (
          'appel_nabeul', 'appel_bizerte', 'appel_kef', 'appel_monastir',
          'appel_kairouan', 'appel_gafsa', 'appel_gabes', 'appel_medenine',
          'tribunal_commerce', 'tribunal_travail'
        )
      `);
      console.log(`✅ Nouveaux tribunaux ajoutés: ${nouveauxCount.rows[0].count} (attendu: 10)`);

      // Vérifier les doublons
      const doublons = await client.query(`
        SELECT code, COUNT(*) as count
        FROM legal_taxonomy
        WHERE type = 'tribunal'
        GROUP BY code
        HAVING COUNT(*) > 1
      `);

      if (doublons.rows.length === 0) {
        console.log('✅ Aucun doublon détecté');
      } else {
        console.log('⚠️  Doublons détectés:', doublons.rows);
      }

      // Lister les nouveaux tribunaux
      console.log('\n📋 NOUVEAUX TRIBUNAUX\n');
      const nouveaux = await client.query(`
        SELECT code, label_fr, label_ar, is_system
        FROM legal_taxonomy
        WHERE code IN (
          'appel_nabeul', 'appel_bizerte', 'appel_kef', 'appel_monastir',
          'appel_kairouan', 'appel_gafsa', 'appel_gabes', 'appel_medenine',
          'tribunal_commerce', 'tribunal_travail'
        )
        ORDER BY code
      `);

      nouveaux.rows.forEach(row => {
        console.log(`  ${row.code.padEnd(20)} → ${row.label_fr}`);
        console.log(`  ${' '.repeat(22)}   ${row.label_ar}`);
        console.log(`  ${' '.repeat(22)}   Système: ${row.is_system ? '✓' : '✗'}\n`);
      });

      // Tout est OK, commit
      await client.query('COMMIT');

      console.log('\n====================================');
      console.log('✅ MIGRATION APPLIQUÉE AVEC SUCCÈS');
      console.log('====================================\n');

      // Résumé final
      const totalCheck = tribunalsCount.rows[0].count == 22 &&
                        coursAppelCount.rows[0].count == 11 &&
                        nouveauxCount.rows[0].count == 10 &&
                        doublons.rows.length === 0;

      if (totalCheck) {
        console.log('✅ Toutes les vérifications passent!\n');
        console.log('Prochaines étapes:');
        console.log('1. Redémarrer le serveur de développement (npm run dev)');
        console.log('2. Vérifier l\'interface sur /super-admin/taxonomy?type=tribunal');
        console.log('3. Exécuter les tests TypeScript: npx tsx scripts/test-tribunals-types.ts\n');
      } else {
        console.log('⚠️  Certaines vérifications ont échoué. Veuillez examiner les résultats ci-dessus.\n');
        process.exit(1);
      }

    } catch (error) {
      // Erreur, rollback
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('\n❌ ERREUR lors de la migration:');
    console.error(error);
    console.error('\nLa migration a été annulée (ROLLBACK).\n');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  applyMigration().catch(error => {
    console.error('Erreur fatale:', error);
    process.exit(1);
  });
}

module.exports = { applyMigration };
