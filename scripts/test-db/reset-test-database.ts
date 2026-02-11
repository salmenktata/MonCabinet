/**
 * Reset toutes les tables de test en respectant les FK
 * Usage: npm run test:db:reset
 * 
 * ⚠️ ATTENTION : Supprime TOUTES les données de test
 */

import pg from 'pg'
import * as readline from 'readline'

const { Pool } = pg

// Configuration (lire depuis .env.local ou utiliser valeurs par défaut)
const DB_NAME = 'qadhya_test'
const DB_USER = process.env.DB_USER || 'moncabinet'
const DB_PASSWORD = process.env.DB_PASSWORD || 'dev_password_change_in_production'
const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = parseInt(process.env.DB_PORT || '5433')

const IS_CI = process.env.CI === 'true' || process.argv.includes('--force')

/**
 * Vérifier qu'on n'est PAS sur la base de production
 */
function validateDatabaseUrl() {
  const dbUrl = process.env.DATABASE_URL || ''

  // Bloquer si la DB ne contient pas 'test'
  if (!dbUrl.includes('test') && !dbUrl.includes(DB_NAME)) {
    console.error('❌ ERREUR : Ce script ne peut être exécuté que sur une base de TEST')
    console.error(`   DATABASE_URL actuelle : ${dbUrl}`)
    console.error(`   Attendu : doit contenir "test" ou "${DB_NAME}"`)
    process.exit(1)
  }

  // Bloquer explicitement si contient 'qadhya' (prod) sans 'test'
  if (dbUrl.includes('/qadhya') && !dbUrl.includes('test')) {
    console.error('❌ ERREUR : Impossible de reset la base de PRODUCTION')
    console.error('   Utilisez DATABASE_URL pointant vers qadhya_test')
    process.exit(1)
  }

  console.log(`✅ Validation: Base de test détectée (${DB_NAME})`)
}

/**
 * Demander confirmation
 */
async function confirm(question: string): Promise<boolean> {
  if (IS_CI) return true

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}

/**
 * Lister toutes les tables à vider
 */
async function getTables(pool: pg.Pool): Promise<string[]> {
  const { rows } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name != 'schema_migrations'
    ORDER BY table_name
  `)

  return rows.map(r => r.table_name)
}

/**
 * Reset toutes les tables
 */
async function resetDatabase() {
  const pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME
  })

  try {
    console.log('🔍 Liste des tables à vider...')
    const tables = await getTables(pool)

    if (tables.length === 0) {
      console.log('⚠️  Aucune table trouvée (hors schema_migrations)')
      return
    }

    console.log(`\n📋 ${tables.length} tables trouvées:`)
    tables.forEach(t => console.log(`   - ${t}`))

    const shouldReset = await confirm('\n⚠️  Voulez-vous SUPPRIMER toutes les données de ces tables ?')
    if (!shouldReset) {
      console.log('❌ Annulé par l\'utilisateur')
      process.exit(0)
    }

    console.log('\n🔄 Reset en cours...\n')

    // Désactiver temporairement les contraintes FK
    await pool.query('BEGIN')
    await pool.query('SET session_replication_role = replica')

    // TRUNCATE toutes les tables
    for (const table of tables) {
      console.log(`🗑️  TRUNCATE ${table}`)
      await pool.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
    }

    // Réactiver les contraintes FK
    await pool.query('SET session_replication_role = origin')
    await pool.query('COMMIT')

    console.log('\n✅ Toutes les tables ont été vidées')

    // Statistiques finales
    console.log('\n📊 Vérification...')
    for (const table of tables) {
      const { rows } = await pool.query(`SELECT COUNT(*) as count FROM ${table}`)
      console.log(`   ${table}: ${rows[0].count} lignes`)
    }

    console.log('\n✅ Reset terminé avec succès!')
    console.log('\n📝 Pour insérer des fixtures, exécutez:')
    console.log('   npm run test:db:seed')

  } catch (error) {
    await pool.query('ROLLBACK')
    console.error('❌ Erreur lors du reset:', error)
    throw error
  } finally {
    await pool.end()
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.log('🚀 Reset de la base de données de test\n')
  console.log(`📌 Base: ${DB_NAME}`)
  console.log(`📌 Host: ${DB_HOST}:${DB_PORT}\n`)

  try {
    validateDatabaseUrl()
    await resetDatabase()
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Échec du reset:', error)
    process.exit(1)
  }
}

// Exécution
main()
