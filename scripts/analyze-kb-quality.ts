#!/usr/bin/env tsx
/**
 * Script d'analyse qualité KB
 *
 * Identifie les documents avec scores <70 pour nettoyage/réindexation
 *
 * Usage: npx tsx scripts/analyze-kb-quality.ts
 */

import { db } from '../lib/db/postgres'

interface QualityAnalysis {
  qualityRange: string
  totalDocs: number
  avgChunks: number
  categories: string
}

interface QualityDistribution {
  qualityScore: number | null
  count: number
  percentage: number
}

interface LowQualityDoc {
  id: string
  title: string
  category: string
  qualityScore: number | null
  chunkCount: number
  contentLength: number
  qualityLlmProvider: string | null
  createdAt: Date
}

async function analyzeKBQuality() {
  console.log('🔍 Analyse qualité Base de Connaissances\n')
  console.log('=' .repeat(80))

  try {
    // 1. Distribution des scores
    console.log('\n📊 DISTRIBUTION DES SCORES QUALITÉ\n')

    const distributionResult = await db.query<QualityDistribution>(`
      SELECT
        quality_score,
        COUNT(*)::int as count,
        ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 1)::numeric as percentage
      FROM knowledge_base
      WHERE is_indexed = true AND is_active = true
      GROUP BY quality_score
      ORDER BY quality_score DESC NULLS LAST
    `)

    console.log('Score\t\tDocs\t\tPourcentage')
    console.log('-'.repeat(60))
    for (const row of distributionResult.rows) {
      const score = row.qualityScore === null ? 'NULL' : row.qualityScore
      console.log(`${score}\t\t${row.count}\t\t${row.percentage}%`)
    }

    // 2. Ranges de qualité
    console.log('\n📈 RANGES DE QUALITÉ\n')

    const rangesResult = await db.query<QualityAnalysis>(`
      SELECT
        CASE
          WHEN quality_score IS NULL THEN 'NULL (non analysé)'
          WHEN quality_score = 50 THEN '50 (échec analyse)'
          WHEN quality_score < 70 THEN '<70 (faible)'
          WHEN quality_score < 80 THEN '70-79 (moyen)'
          ELSE '>=80 (bon)'
        END as quality_range,
        COUNT(*)::int as total_docs,
        ROUND(AVG(chunk_count)::numeric, 1)::numeric as avg_chunks,
        string_agg(DISTINCT category, ', ') as categories
      FROM knowledge_base
      WHERE is_indexed = true AND is_active = true
      GROUP BY
        CASE
          WHEN quality_score IS NULL THEN 'NULL (non analysé)'
          WHEN quality_score = 50 THEN '50 (échec analyse)'
          WHEN quality_score < 70 THEN '<70 (faible)'
          WHEN quality_score < 80 THEN '70-79 (moyen)'
          ELSE '>=80 (bon)'
        END
      ORDER BY
        CASE
          WHEN quality_score IS NULL THEN 0
          WHEN quality_score = 50 THEN 1
          WHEN quality_score < 70 THEN 2
          WHEN quality_score < 80 THEN 3
          ELSE 4
        END
    `)

    console.log('Range\t\t\t\tDocs\tMoy Chunks\tCatégories')
    console.log('-'.repeat(100))
    for (const row of rangesResult.rows) {
      console.log(`${row.qualityRange.padEnd(25)}\t${row.totalDocs}\t${row.avgChunks}\t\t${row.categories}`)
    }

    // 3. Détails documents faible qualité (<70)
    console.log('\n🔴 DOCUMENTS FAIBLE QUALITÉ (<70)\n')

    const lowQualityResult = await db.query<LowQualityDoc>(`
      SELECT
        id,
        title,
        category,
        quality_score,
        chunk_count,
        LENGTH(content) as content_length,
        quality_llm_provider,
        created_at
      FROM knowledge_base
      WHERE is_indexed = true
        AND is_active = true
        AND (quality_score < 70 OR quality_score IS NULL)
      ORDER BY quality_score NULLS FIRST, created_at DESC
      LIMIT 50
    `)

    if (lowQualityResult.rows.length === 0) {
      console.log('✅ Aucun document avec score <70 trouvé !')
    } else {
      console.log(`Total: ${lowQualityResult.rows.length} documents\n`)
      console.log('Score\tChunks\tTaille\tProvider\tCatégorie\t\tTitre')
      console.log('-'.repeat(120))

      for (const doc of lowQualityResult.rows) {
        const score = doc.qualityScore === null ? 'NULL' : doc.qualityScore
        const provider = doc.qualityLlmProvider || 'N/A'
        console.log(
          `${score}\t${doc.chunkCount}\t${doc.contentLength}\t${provider}\t\t${doc.category.padEnd(15)}\t${doc.title.substring(0, 50)}`
        )
      }
    }

    // 4. Statistiques par provider (échecs)
    console.log('\n📊 ÉCHECS PAR PROVIDER LLM\n')

    const providerFailuresResult = await db.query(`
      SELECT
        COALESCE(quality_llm_provider, 'Non analysé') as provider,
        COUNT(*) FILTER (WHERE quality_score = 50) as failures,
        COUNT(*) FILTER (WHERE quality_score IS NULL) as not_analyzed,
        COUNT(*) as total,
        ROUND(
          COUNT(*) FILTER (WHERE quality_score = 50)::numeric /
          NULLIF(COUNT(*) FILTER (WHERE quality_score IS NOT NULL), 0) * 100,
          1
        )::numeric as failure_rate
      FROM knowledge_base
      WHERE is_indexed = true AND is_active = true
      GROUP BY quality_llm_provider
      ORDER BY failures DESC
    `)

    console.log('Provider\t\tÉchecs\tNon analysés\tTotal\tTaux échec')
    console.log('-'.repeat(80))
    for (const row of providerFailuresResult.rows) {
      const failureRate = row.failure_rate === null ? 'N/A' : `${row.failure_rate}%`
      console.log(
        `${row.provider.padEnd(15)}\t${row.failures}\t${row.not_analyzed}\t\t${row.total}\t${failureRate}`
      )
    }

    // 5. Recommandations
    console.log('\n💡 RECOMMANDATIONS\n')

    const totalLowQuality = lowQualityResult.rows.length
    const nullScores = distributionResult.rows.find(r => r.qualityScore === null)?.count || 0
    const score50 = distributionResult.rows.find(r => r.qualityScore === 50)?.count || 0

    if (nullScores > 0) {
      console.log(`⚠️  ${nullScores} documents non analysés → Lancer analyse qualité batch`)
    }

    if (score50 > 0) {
      console.log(`🔴 ${score50} documents avec score=50 (échec) → Réanalyser avec provider alternatif (OpenAI)`)
    }

    if (totalLowQuality > 0 && totalLowQuality > nullScores + score50) {
      const realLowQuality = totalLowQuality - nullScores - score50
      console.log(`⚠️  ${realLowQuality} documents score <70 → Vérifier contenu et réindexer si nécessaire`)
    }

    console.log('\n✅ Scripts disponibles:')
    console.log('  - npx tsx scripts/reanalyze-kb-failures.ts (réanalyser score=50)')
    console.log('  - npx tsx scripts/cleanup-low-quality-kb.ts (nettoyer docs corrompus)')
    console.log('  - npx tsx scripts/reindex-kb-improved.ts (réindexer avec extraction améliorée)')

    console.log('\n' + '='.repeat(80))
    console.log('✅ Analyse terminée\n')

  } catch (error) {
    console.error('❌ Erreur analyse:', error)
    throw error
  } finally {
    await db.end()
  }
}

// Exécuter
analyzeKBQuality().catch(console.error)
