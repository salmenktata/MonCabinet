/**
 * Script pour appliquer les migrations Google Drive
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { db } from '@/lib/db/postgres'

async function applyMigrations() {
  console.log('📦 Application des migrations Google Drive...\n')

  const migrations = [
    '20260211000001_add_google_drive_support.sql',
    '20260211000002_create_system_settings.sql',
  ]

  for (const migrationFile of migrations) {
    try {
      console.log(`⏳ ${migrationFile}...`)
      const sql = readFileSync(
        join(process.cwd(), 'db', 'migrations', migrationFile),
        'utf-8'
      )

      await db.query(sql)
      console.log(`✅ ${migrationFile} - OK\n`)
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(`⚠️  ${migrationFile} - Déjà appliquée\n`)
      } else {
        console.error(`❌ ${migrationFile} - Erreur:`, error.message)
        throw error
      }
    }
  }

  console.log('✨ Migrations appliquées avec succès!')
  await db.closePool()
}

applyMigrations().catch((error) => {
  console.error('Erreur fatale:', error)
  process.exit(1)
})
