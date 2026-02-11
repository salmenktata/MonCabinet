/**
 * Crée la base de données de test et applique toutes les migrations
 * Usage: npm run test:db:create
 * 
 * ⚠️ ATTENTION : Ce script va SUPPRIMER la base de test existante
 */

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import pg from 'pg'
import * as readline from 'readline'

const { Pool } = pg

// Configuration (lire depuis .env.local ou utiliser valeurs par défaut)
const DB_NAME = 'qadhya_test'
const DB_USER = process.env.DB_USER || 'moncabinet'
const DB_PASSWORD = process.env.DB_PASSWORD || 'dev_password_change_in_production'
const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = parseInt(process.env.DB_PORT || '5433')

// Vérifier si on est en mode CI (pas d'interaction)
const IS_CI = process.env.CI === 'true' || process.argv.includes('--force')

/**
 * Demander confirmation à l'utilisateur (sauf en CI)
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
 * Créer la base de données de test
 */
async function createDatabase() {
  // Connexion à la base postgres par défaut
  const adminPool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: 'postgres'
  })

  try {
    console.log('🔍 Vérification de l\'existence de la base de test...')

    // Vérifier si la base existe
    const { rows } = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [DB_NAME]
    )

    if (rows.length > 0) {
      console.log(`⚠️  La base "${DB_NAME}" existe déjà.`)

      const shouldDrop = await confirm('Voulez-vous la supprimer et la recréer ?')
      if (!shouldDrop) {
        console.log('❌ Annulé par l\'utilisateur')
        process.exit(0)
      }

      // Fermer les connexions actives
      await adminPool.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = '${DB_NAME}'
          AND pid <> pg_backend_pid()
      `)

      console.log(`🗑️  Suppression de la base "${DB_NAME}"...`)
      await adminPool.query(`DROP DATABASE ${DB_NAME}`)
    }

    console.log(`🔨 Création de la base "${DB_NAME}"...`)
    await adminPool.query(`CREATE DATABASE ${DB_NAME}`)
    console.log(`✅ Base "${DB_NAME}" créée avec succès\n`)

  } finally {
    await adminPool.end()
  }
}

/**
 * Activer les extensions nécessaires
 */
async function setupExtensions() {
  const pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME
  })

  try {
    console.log('🔧 Activation de l\'extension pgvector...')
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector')
    console.log('✅ Extension pgvector activée\n')
  } finally {
    await pool.end()
  }
}

/**
 * Appliquer le schéma complet depuis full-schema-dump.sql
 */
async function applySchema() {
  const pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME
  })

  try {
    console.log('📦 Application du schéma complet...\n')

    // Charger le dump du schéma complet
    const schemaPath = join(process.cwd(), 'scripts', 'full-schema-dump.sql')
    let sql = readFileSync(schemaPath, 'utf-8')

    console.log('🔄 Nettoyage des commandes psql...')

    // Filtrer les commandes psql (qui commencent par \)
    sql = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('\\'))
      .join('\n')

    console.log('🔄 Exécution de full-schema-dump.sql...')

    // Exécuter le script complet (pas besoin de transaction car le dump gère ça)
    await pool.query(sql)

    console.log('✅ Schéma complet appliqué avec succès!\n')

  } finally {
    await pool.end()
  }
}

/**
 * Vérifier l'intégrité de la base
 */
async function verifyDatabase() {
  const pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME
  })

  try {
    console.log('🔍 Vérification de l\'intégrité...')

    // Compter les tables
    const { rows: tables } = await pool.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `)

    console.log(`✅ ${tables[0].count} tables créées`)

    // Vérifier l'extension vector
    const { rows: extensions } = await pool.query(`
      SELECT * FROM pg_extension WHERE extname = 'vector'
    `)

    if (extensions.length > 0) {
      console.log('✅ Extension pgvector active')
    } else {
      console.warn('⚠️  Extension pgvector non trouvée')
    }

    console.log('\n✅ Base de test créée et vérifiée avec succès!')
    console.log(`\n📝 Pour insérer des fixtures de test, exécutez:`)
    console.log(`   npm run test:db:seed`)

  } finally {
    await pool.end()
  }
}

/**
 * Fonction principale
 */
async function main() {
  console.log('🚀 Création de la base de données de test\n')
  console.log(`📌 Base: ${DB_NAME}`)
  console.log(`📌 Host: ${DB_HOST}:${DB_PORT}`)
  console.log(`📌 User: ${DB_USER}\n`)

  try {
    await createDatabase()
    await setupExtensions()
    await applySchema()
    await verifyDatabase()

    console.log('\n🎉 Base de test prête à l\'emploi!')
    process.exit(0)

  } catch (error) {
    console.error('\n❌ Erreur lors de la création de la base de test:', error)
    process.exit(1)
  }
}

// Exécution
main()
