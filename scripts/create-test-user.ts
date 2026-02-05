/**
 * Script pour créer un utilisateur de test dans PostgreSQL
 */

import { hash } from 'bcryptjs'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function createTestUser() {
  const email = 'test@moncabinet.tn'
  const password = 'Test123!'
  const nom = 'Test'
  const prenom = 'Utilisateur'

  console.log('🔐 Création utilisateur de test...')
  console.log(`Email: ${email}`)
  console.log(`Mot de passe: ${password}`)

  try {
    // Vérifier si l'utilisateur existe déjà
    const checkResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    )

    if (checkResult.rows.length > 0) {
      console.log('⚠️  Un utilisateur avec cet email existe déjà')

      // Mettre à jour le mot de passe
      const passwordHash = await hash(password, 10)
      await pool.query(
        'UPDATE users SET password_hash = $1, nom = $2, prenom = $3, updated_at = NOW() WHERE email = $4',
        [passwordHash, nom, prenom, email]
      )
      console.log('✅ Mot de passe mis à jour')
    } else {
      // Créer un nouveau hash bcrypt (10 rounds)
      const passwordHash = await hash(password, 10)

      // Insérer l'utilisateur
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, nom, prenom, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id, email, nom, prenom`,
        [email, passwordHash, nom, prenom]
      )

      console.log('✅ Utilisateur créé avec succès!')
      console.log('ID:', result.rows[0].id)
    }

    console.log('\n📋 Credentials de connexion:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Email:        ${email}`)
    console.log(`Mot de passe: ${password}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('\n🌐 Testez sur: http://localhost:7002/login')
  } catch (error) {
    console.error('❌ Erreur lors de la création:', error)
    throw error
  } finally {
    await pool.end()
  }
}

createTestUser()
