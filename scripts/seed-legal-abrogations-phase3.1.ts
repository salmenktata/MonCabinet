/**
 * Script de Seed - Phase 3.1 : Abrogations Juridiques Tunisiennes Validées
 *
 * Insère les 17 abrogations identifiées et vérifiées lors de la Phase 3.1
 * Sources : KB Qadhya + Recherche JORT + Lois Finances + Codes Consolidés
 *
 * Usage : npx tsx scripts/seed-legal-abrogations-phase3.1.ts
 */

import { db } from '../lib/db/postgres'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'

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
  affected_articles: string
  jort_url: string
  source_url: string
  notes: string
  domain: string
  verified: string
  confidence: 'high' | 'medium' | 'low'
}

// =============================================================================
// FONCTION LECTURE CSV
// =============================================================================

function readAbrogationsFromCSV(filePath: string): AbrogationCSV[] {
  const csvContent = fs.readFileSync(filePath, 'utf-8')

  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })

  return records as AbrogationCSV[]
}

// =============================================================================
// FONCTION PARSE ARTICLES
// =============================================================================

function parseAffectedArticles(articlesStr: string): string[] | null {
  if (!articlesStr || articlesStr.trim() === '') return null

  // Split par ; ou ,
  return articlesStr
    .split(/[;,]/)
    .map(art => art.trim())
    .filter(art => art.length > 0)
}

// =============================================================================
// FONCTION PRINCIPALE
// =============================================================================

async function seedPhase31() {
  console.log('🌱 Phase 3.1 - Seed Abrogations Juridiques Tunisiennes\n')

  // Chemin CSV
  const csvPath = path.join(__dirname, '../data/abrogations/phase3.1-abrogations-consolidees.csv')

  console.log(`📂 Lecture CSV : ${csvPath}`)

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Fichier CSV introuvable : ${csvPath}`)
    process.exit(1)
  }

  const abrogations = readAbrogationsFromCSV(csvPath)
  console.log(`📊 ${abrogations.length} abrogations à insérer\n`)

  let insertedCount = 0
  let skippedCount = 0
  let errorCount = 0

  for (const abrogation of abrogations) {
    try {
      // Parse date
      const abrogationDate = abrogation.abrogation_date
        ? new Date(abrogation.abrogation_date)
        : new Date()

      // Parse verified
      const verified = abrogation.verified === 'true' || abrogation.verified === '1'

      // Parse affected articles
      const affectedArticles = parseAffectedArticles(abrogation.affected_articles)

      // Insert
      const result = await db.query(
        `INSERT INTO legal_abrogations (
          abrogated_reference,
          abrogated_reference_ar,
          abrogating_reference,
          abrogating_reference_ar,
          abrogation_date,
          scope,
          affected_articles,
          source_url,
          jort_url,
          notes,
          domain,
          verified,
          confidence,
          verification_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (abrogated_reference, abrogating_reference) DO NOTHING
        RETURNING id`,
        [
          abrogation.abrogated_reference,
          abrogation.abrogated_reference_ar || null,
          abrogation.abrogating_reference,
          abrogation.abrogating_reference_ar || null,
          abrogationDate,
          abrogation.scope,
          affectedArticles,
          abrogation.source_url || null,
          abrogation.jort_url || null,
          abrogation.notes,
          abrogation.domain || 'autre',
          verified,
          abrogation.confidence || 'high',
          verified ? 'verified' : 'pending',
        ]
      )

      if (result.rowCount && result.rowCount > 0) {
        insertedCount++
        console.log(`✅ ${abrogation.abrogated_reference} → ${abrogation.abrogating_reference}`)
        console.log(`   Domaine: ${abrogation.domain}, Date: ${abrogation.abrogation_date}, Verified: ${verified}`)
      } else {
        skippedCount++
        console.log(`⏭️  Skipped (duplicate): ${abrogation.abrogated_reference}`)
      }
    } catch (error: any) {
      errorCount++
      console.error(`❌ Erreur: ${abrogation.abrogated_reference}`)
      console.error(`   Message: ${error.message}`)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('📊 Résumé Seed Phase 3.1:')
  console.log('='.repeat(80))
  console.log(`✅ Insérées avec succès : ${insertedCount}`)
  console.log(`⏭️  Skipped (doublons)   : ${skippedCount}`)
  console.log(`❌ Erreurs              : ${errorCount}`)
  console.log(`📝 Total CSV            : ${abrogations.length}`)
  console.log('='.repeat(80))

  if (insertedCount > 0) {
    console.log('\n✨ Seed Phase 3.1 terminé avec succès!')
    console.log(`🎯 ${insertedCount} nouvelles abrogations ajoutées à la base de données`)
  } else if (skippedCount === abrogations.length) {
    console.log('\n⚠️  Toutes les abrogations existent déjà (aucune insertion)')
  } else {
    console.log('\n⚠️  Seed terminé avec des erreurs')
  }

  // Afficher statistiques finales
  console.log('\n📈 Statistiques Base de Données:')

  try {
    const totalResult = await db.query('SELECT COUNT(*) as total FROM legal_abrogations')
    const verifiedResult = await db.query('SELECT COUNT(*) as total FROM legal_abrogations WHERE verified = true')
    const byDomainResult = await db.query(`
      SELECT domain, COUNT(*) as count
      FROM legal_abrogations
      WHERE domain IS NOT NULL
      GROUP BY domain
      ORDER BY count DESC
    `)

    console.log(`   Total abrogations     : ${totalResult.rows[0].total}`)
    console.log(`   Vérifiées (verified)  : ${verifiedResult.rows[0].total}`)
    console.log('\n   Répartition par domaine:')
    byDomainResult.rows.forEach((row: any) => {
      console.log(`   - ${row.domain.padEnd(20)}: ${row.count}`)
    })
  } catch (error) {
    console.log('   (Erreur lors de la récupération des statistiques)')
  }
}

// =============================================================================
// EXÉCUTION
// =============================================================================

seedPhase31()
  .then(() => {
    console.log('\n👋 Processus terminé')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Erreur fatale:', error)
    process.exit(1)
  })
