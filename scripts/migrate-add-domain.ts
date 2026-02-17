/**
 * Migration: Ajout colonnes domain, verified, confidence à legal_abrogations
 */

import { db } from '../lib/db/postgres'
import fs from 'fs'
import path from 'path'

async function runMigration() {
  console.log('🔧 Migration: Ajout colonnes domain/verified/confidence\n')

  const migrationPath = path.join(__dirname, '../migrations/20260213_add_domain_legal_abrogations.sql')
  const sql = fs.readFileSync(migrationPath, 'utf-8')

  try {
    await db.query(sql)
    console.log('✅ Migration exécutée avec succès')
  } catch (error) {
    console.error('❌ Erreur migration:', error.message)
    throw error
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
