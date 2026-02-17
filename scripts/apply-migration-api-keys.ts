#!/usr/bin/env tsx
/**
 * Applique la migration de la table api_keys
 */

// Charger .env.local avant toute autre chose
import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from '../lib/db/postgres'
import fs from 'fs'
import path from 'path'

async function main() {
  console.log('📦 Application migration api_keys...\n')

  const sqlPath = path.join(process.cwd(), 'migrations/20260209_create_api_keys_table.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')

  try {
    await db.query(sql)
    console.log('✅ Migration appliquée avec succès\n')
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Table api_keys existe déjà\n')
    } else {
      throw error
    }
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Erreur:', err)
  process.exit(1)
})
