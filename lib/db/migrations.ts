/**
 * Système de migration automatique PostgreSQL
 * Remplace Supabase - Exécution automatique au démarrage
 */

import { getPool } from './postgres'
import fs from 'fs'
import path from 'path'

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations')

interface Migration {
  name: string
  applied_at: Date
}

/**
 * Crée la table _migrations si elle n'existe pas
 */
async function ensureMigrationsTable(): Promise<void> {
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(500) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
}

/**
 * Récupère les migrations déjà appliquées
 */
async function getAppliedMigrations(): Promise<string[]> {
  const pool = getPool()
  const result = await pool.query<Migration>(
    'SELECT name FROM _migrations ORDER BY name'
  )
  return result.rows.map((row: Migration) => row.name)
}

/**
 * Récupère toutes les migrations disponibles
 */
function getAvailableMigrations(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('⚠️ Dossier migrations non trouvé:', MIGRATIONS_DIR)
    return []
  }

  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort()
}

/**
 * Applique une migration
 */
async function applyMigration(migrationName: string): Promise<void> {
  const pool = getPool()
  const filePath = path.join(MIGRATIONS_DIR, migrationName)
  const sql = fs.readFileSync(filePath, 'utf-8')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Exécuter la migration
    await client.query(sql)

    // Enregistrer la migration
    await client.query(
      'INSERT INTO _migrations (name) VALUES ($1)',
      [migrationName]
    )

    await client.query('COMMIT')
    console.log(`✅ Migration appliquée: ${migrationName}`)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(`❌ Erreur migration ${migrationName}:`, error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Exécute toutes les migrations en attente
 */
export async function runMigrations(): Promise<{
  applied: string[]
  skipped: string[]
  errors: string[]
}> {
  const result = {
    applied: [] as string[],
    skipped: [] as string[],
    errors: [] as string[]
  }

  try {
    await ensureMigrationsTable()

    const appliedMigrations = await getAppliedMigrations()
    const availableMigrations = getAvailableMigrations()

    const pendingMigrations = availableMigrations.filter(
      m => !appliedMigrations.includes(m)
    )

    if (pendingMigrations.length === 0) {
      console.log('✅ Base de données à jour - Aucune migration en attente')
      result.skipped = availableMigrations
      return result
    }

    console.log(`🔄 ${pendingMigrations.length} migration(s) à appliquer...`)

    for (const migration of pendingMigrations) {
      try {
        await applyMigration(migration)
        result.applied.push(migration)
      } catch (error) {
        result.errors.push(migration)
        // Continuer avec les autres migrations ou s'arrêter ?
        // Pour l'instant on s'arrête à la première erreur
        break
      }
    }

    return result
  } catch (error) {
    console.error('❌ Erreur système de migration:', error)
    throw error
  }
}

/**
 * Vérifie l'état des migrations sans les appliquer
 */
export async function checkMigrations(): Promise<{
  applied: string[]
  pending: string[]
  total: number
}> {
  try {
    await ensureMigrationsTable()

    const appliedMigrations = await getAppliedMigrations()
    const availableMigrations = getAvailableMigrations()

    const pendingMigrations = availableMigrations.filter(
      m => !appliedMigrations.includes(m)
    )

    return {
      applied: appliedMigrations,
      pending: pendingMigrations,
      total: availableMigrations.length
    }
  } catch (error) {
    console.error('❌ Erreur vérification migrations:', error)
    throw error
  }
}

/**
 * Compare les tables entre deux bases (dev vs prod)
 */
export async function getTablesInfo(): Promise<{
  tables: string[]
  columns: Record<string, string[]>
}> {
  const pool = getPool()
  const tablesResult = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `)

  const tables = tablesResult.rows.map((r: { table_name: string }) => r.table_name)
  const columns: Record<string, string[]> = {}

  for (const table of tables) {
    const colsResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [table])
    columns[table] = colsResult.rows.map((r: { column_name: string }) => r.column_name)
  }

  return { tables, columns }
}
