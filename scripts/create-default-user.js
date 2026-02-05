/**
 * Script de création d'utilisateur par défaut
 * Usage: node scripts/create-default-user.js
 */

const { hash } = require('bcryptjs');
const { Pool } = require('pg');

async function createDefaultUser() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://moncabinet:dev_password_change_in_production@localhost:5433/moncabinet'
  });

  try {
    console.log('🔐 Création utilisateur par défaut...\n');

    const email = 'salmen.ktata@gmail.com';
    const password = '724@Lnb.13';
    const nom = 'Ktata';
    const prenom = 'Salmen';

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await pool.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      console.log('⚠️  Utilisateur existe déjà:', email);
      console.log('🔄 Mise à jour du mot de passe...\n');

      // Hasher le nouveau mot de passe
      const passwordHash = await hash(password, 10);

      // Mettre à jour le mot de passe
      await pool.query(
        'UPDATE users SET password_hash = $1, nom = $2, prenom = $3, updated_at = NOW() WHERE email = $4',
        [passwordHash, nom, prenom, email]
      );

      console.log('✅ Mot de passe mis à jour avec succès!');
    } else {
      console.log('➕ Création nouvel utilisateur...\n');

      // Hasher le mot de passe
      const passwordHash = await hash(password, 10);

      // Créer l'utilisateur
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, nom, prenom, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id, email, nom, prenom`,
        [email, passwordHash, nom, prenom]
      );

      console.log('✅ Utilisateur créé avec succès!');
      console.log('📋 Détails:', result.rows[0]);
    }

    console.log('\n🔐 Identifiants de connexion:');
    console.log('   Email:    ', email);
    console.log('   Password: ', password);
    console.log('\n🌐 URL login: http://localhost:7002/login');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    await pool.end();
    process.exit(1);
  }
}

createDefaultUser();
