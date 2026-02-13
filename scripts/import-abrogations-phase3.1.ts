/**
 * Import des abrogations Phase 3.1 vers la base de données
 *
 * Usage:
 *   npx tsx scripts/import-abrogations-phase3.1.ts --staging
 *   npx tsx scripts/import-abrogations-phase3.1.ts --production
 */

import { Pool } from 'pg'
import * as fs from 'fs'
import * as path from 'path'

// =============================================================================
// CONFIGURATION
// =============================================================================

const LOCAL_DB = {
  host: 'localhost',
  port: 5433,
  database: 'moncabinet',
  user: 'moncabinet',
  password: 'moncabinet',
}

const PROD_DB = {
  host: 'localhost',
  port: 5434, // Tunnel SSH
  database: 'qadhya',
  user: 'moncabinet',
  password: process.env.DB_PASSWORD || '',
}

// =============================================================================
// TYPES
// =============================================================================

interface AbrogationCSV {
  abrogated_reference: string
  abrogated_reference_ar: string
  abrogating_reference: string
  abrogating_reference_ar: string
  abrogation_date: string
  scope: 'total' | 'partial' | 'implicit'
  affected_articles?: string
  jort_url?: string
  source_url?: string
  notes: string
  domain: string
  verified: string
}

// =============================================================================
// FONCTIONS
// =============================================================================

function parseCSV(filePath: string): AbrogationCSV[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').filter(l => l.trim())

  if (lines.length < 2) {
    throw new Error('CSV vide ou invalide')
  }

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  const rows = lines.slice(1)

  return rows.map(row => {
    // Parser CSV avec gestion des guillemets
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < row.length; i++) {
      const char = row[i]

      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())

    const obj: any = {}
    headers.forEach((header, i) => {
      obj[header] = values[i] || ''
    })

    return obj as AbrogationCSV
  })
}

async function importAbrogations(pool: Pool, abrogations: AbrogationCSV[], dryRun: boolean = false) {
  console.log(`\n📥 Import de ${abrogations.length} abrogations...\n`)

  let imported = 0
  let skipped = 0
  let errors = 0

  for (const abr of abrogations) {
    try {
      // Vérifier si existe déjà
      const existing = await pool.query(
        `SELECT id FROM legal_abrogations
         WHERE abrogated_reference = $1 AND abrogating_reference = $2`,
        [abr.abrogated_reference, abr.abrogating_reference]
      )

      if (existing.rows.length > 0) {
        console.log(`⏭️  Skip: ${abr.abrogated_reference} (existe déjà)`)
        skipped++
        continue
      }

      if (dryRun) {
        console.log(`✓ [DRY RUN] ${abr.abrogated_reference} → ${abr.abrogating_reference}`)
        imported++
        continue
      }

      // Insérer
      const affectedArticlesArray = abr.affected_articles
        ? `{${abr.affected_articles}}`
        : null

      await pool.query(
        `INSERT INTO legal_abrogations (
          abrogated_reference,
          abrogated_reference_ar,
          abrogating_reference,
          abrogating_reference_ar,
          abrogation_date,
          scope,
          affected_articles,
          jort_url,
          source_url,
          notes,
          verification_status,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
        [
          abr.abrogated_reference,
          abr.abrogated_reference_ar,
          abr.abrogating_reference,
          abr.abrogating_reference_ar,
          abr.abrogation_date,
          abr.scope,
          affectedArticlesArray,
          abr.jort_url || null,
          abr.source_url || null,
          `${abr.notes} (Domaine: ${abr.domain})`,
          abr.verified === 'true' ? 'verified' : 'pending',
        ]
      )

      console.log(`✅ Importé: ${abr.abrogated_reference}`)
      imported++

    } catch (error: any) {
      console.error(`❌ Erreur: ${abr.abrogated_reference} - ${error.message}`)
      errors++
    }
  }

  console.log(`\n📊 RÉSUMÉ:`)
  console.log(`   Importés: ${imported}`)
  console.log(`   Ignorés (doublons): ${skipped}`)
  console.log(`   Erreurs: ${errors}`)
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('🚀 Import Abrogations Phase 3.1\n')

  const args = process.argv.slice(2)
  const isProduction = args.includes('--production')
  const isStaging = args.includes('--staging')
  const dryRun = args.includes('--dry-run')
  const csvFile = args.find(a => a.endsWith('.csv')) || 'data/abrogations/phase3.1-extraction-manuelle.csv'

  if (!isProduction && !isStaging) {
    console.error('❌ Spécifiez --staging ou --production')
    process.exit(1)
  }

  const dbConfig = isProduction ? PROD_DB : LOCAL_DB
  const pool = new Pool(dbConfig)

  console.log(`📊 Environnement: ${isProduction ? 'PRODUCTION' : 'STAGING'}`)
  console.log(`   Base: ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`)
  console.log(`   Fichier: ${csvFile}`)
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'IMPORT RÉEL'}\n`)

  try {
    // Vérifier connexion DB
    await pool.query('SELECT 1')
    console.log('✅ Connexion DB OK\n')

    // Parser CSV
    const csvPath = path.join(process.cwd(), csvFile)
    if (!fs.existsSync(csvPath)) {
      throw new Error(`Fichier CSV introuvable: ${csvPath}`)
    }

    const abrogations = parseCSV(csvPath)
    console.log(`✅ CSV parsé: ${abrogations.length} abrogations\n`)

    // Vérifier table existe
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'legal_abrogations'
      )
    `)

    if (!tableCheck.rows[0].exists) {
      throw new Error('Table legal_abrogations inexistante')
    }

    // Import
    await importAbrogations(pool, abrogations, dryRun)

    console.log(`\n✅ Import terminé !`)

  } catch (error: any) {
    console.error(`\n❌ Erreur:`, error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main().catch(console.error)
