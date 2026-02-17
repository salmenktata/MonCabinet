#!/usr/bin/env npx tsx

/**
 * Script de création de Super Admin
 *
 * Usage:
 * SUPER_ADMIN_EMAIL=admin@example.com SUPER_ADMIN_PASSWORD=SecureP@ss123 npx tsx scripts/create-super-admin.ts
 *
 * Ou avec un fichier .env:
 * npx tsx scripts/create-super-admin.ts
 */

import { hash } from 'bcryptjs'
import pg from 'pg'

// Charger les variables d'environnement
import 'dotenv/config'

const { Pool } = pg

// Configuration
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function main() {
  log('\n=== Création Super Admin Qadhya ===\n', 'cyan')

  // Vérifier les variables requises
  if (!SUPER_ADMIN_EMAIL) {
    log('Erreur: SUPER_ADMIN_EMAIL non défini', 'red')
    log('Usage: SUPER_ADMIN_EMAIL=admin@example.com SUPER_ADMIN_PASSWORD=... npx tsx scripts/create-super-admin.ts', 'yellow')
    process.exit(1)
  }

  if (!SUPER_ADMIN_PASSWORD) {
    log('Erreur: SUPER_ADMIN_PASSWORD non défini', 'red')
    log('Usage: SUPER_ADMIN_EMAIL=admin@example.com SUPER_ADMIN_PASSWORD=... npx tsx scripts/create-super-admin.ts', 'yellow')
    process.exit(1)
  }

  // Valider le mot de passe
  if (SUPER_ADMIN_PASSWORD.length < 8) {
    log('Erreur: Le mot de passe doit contenir au moins 8 caractères', 'red')
    process.exit(1)
  }

  // Valider l'email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(SUPER_ADMIN_EMAIL)) {
    log('Erreur: Email invalide', 'red')
    process.exit(1)
  }

  // Connexion à la base de données
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  })

  try {
    log('Connexion à la base de données...', 'blue')
    const client = await pool.connect()

    try {
      // Vérifier si un super_admin existe déjà
      log('Vérification des super admins existants...', 'blue')
      const existingResult = await client.query(
        "SELECT id, email FROM users WHERE role = 'super_admin'"
      )

      if (existingResult.rows.length > 0) {
        log(`\nUn super admin existe déjà: ${existingResult.rows[0].email}`, 'yellow')
        log('Voulez-vous quand même créer un nouveau super admin ?', 'yellow')
        log('Continuez si vous voulez avoir plusieurs super admins.', 'yellow')
      }

      // Vérifier si l'email existe déjà
      log('Vérification de l\'email...', 'blue')
      const emailResult = await client.query(
        'SELECT id, role FROM users WHERE email = $1',
        [SUPER_ADMIN_EMAIL.toLowerCase()]
      )

      if (emailResult.rows.length > 0) {
        const existingUser = emailResult.rows[0]

        if (existingUser.role === 'super_admin') {
          log(`\nCe compte est déjà un super admin: ${SUPER_ADMIN_EMAIL}`, 'green')
          process.exit(0)
        }

        // Promouvoir l'utilisateur existant
        log(`\nUtilisateur existant trouvé. Promotion en super admin...`, 'yellow')

        await client.query(
          `UPDATE users SET
            role = 'super_admin',
            status = 'approved',
            is_approved = TRUE,
            approved_at = NOW()
           WHERE id = $1`,
          [existingUser.id]
        )

        log(`\n✅ Utilisateur promu en super admin: ${SUPER_ADMIN_EMAIL}`, 'green')
        process.exit(0)
      }

      // Créer le nouveau super admin
      log('Hachage du mot de passe...', 'blue')
      const passwordHash = await hash(SUPER_ADMIN_PASSWORD, 10)

      log('Création du super admin...', 'blue')
      const result = await client.query(
        `INSERT INTO users (
          email,
          password_hash,
          nom,
          prenom,
          role,
          status,
          is_approved,
          approved_at,
          email_verified,
          plan,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, NOW(), NOW())
        RETURNING id, email`,
        [
          SUPER_ADMIN_EMAIL.toLowerCase(),
          passwordHash,
          'Admin',
          'Super',
          'super_admin',
          'approved',
          true,
          true,
          'enterprise',
        ]
      )

      const newUser = result.rows[0]

      // Créer le profil associé
      await client.query(
        `INSERT INTO profiles (
          id,
          email,
          nom,
          prenom,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING`,
        [newUser.id, newUser.email, 'Admin', 'Super']
      )

      log('\n' + '='.repeat(50), 'green')
      log('✅ Super Admin créé avec succès!', 'green')
      log('='.repeat(50), 'green')
      log(`\nEmail:    ${SUPER_ADMIN_EMAIL}`, 'cyan')
      log(`ID:       ${newUser.id}`, 'cyan')
      log(`Rôle:     super_admin`, 'cyan')
      log(`Plan:     enterprise`, 'cyan')
      log('\nVous pouvez maintenant vous connecter sur:', 'blue')
      log(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login`, 'yellow')
      log('\nPuis accéder au panneau super admin:', 'blue')
      log(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/super-admin/dashboard`, 'yellow')
      log('')

    } finally {
      client.release()
    }
  } catch (error) {
    log(`\n❌ Erreur: ${getErrorMessage(error)}`, 'red')

    if (error.code === '23505') {
      log('L\'email existe déjà dans la base de données', 'yellow')
    }

    if (error.code === 'ECONNREFUSED') {
      log('Impossible de se connecter à la base de données', 'yellow')
      log('Vérifiez que DATABASE_URL est correctement configuré', 'yellow')
    }

    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
