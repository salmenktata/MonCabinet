import { Pool } from 'pg'
import * as fs from 'fs'

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'moncabinet',
  password: 'Vq98yz4RVRXRtU9bnhtxbnhtx',
  database: 'moncabinet',
})

async function runAnalysis() {
  console.log('═══════════════════════════════════════════════')
  console.log('  ANALYSE DISTRIBUTION SCORES DE QUALITÉ')
  console.log('═══════════════════════════════════════════════\n')

  // 1. Distribution générale
  console.log('📊 DISTRIBUTION GÉNÉRALE\n')
  const dist = await pool.query(`
    SELECT
      CASE
        WHEN quality_score < 20 THEN '00-19 Très faible'
        WHEN quality_score < 40 THEN '20-39 Faible'
        WHEN quality_score < 60 THEN '40-59 Moyen'
        WHEN quality_score < 80 THEN '60-79 Bon'
        ELSE '80-100 Excellent'
      END as range,
      COUNT(*) as count,
      ROUND(AVG(quality_score), 1) as avg_score,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as pct
    FROM knowledge_base
    WHERE quality_score IS NOT NULL
    GROUP BY range
    ORDER BY range
  `)

  for (const row of dist.rows) {
    console.log(`   ${row.range.padEnd(25)} ${row.count.toString().padStart(3)} docs (${row.pct}%) - avg: ${row.avg_score}`)
  }

  // 2. Top 5 meilleurs scores
  console.log('\n\n✅ TOP 5 MEILLEURS SCORES\n')
  const top = await pool.query(`
    SELECT
      SUBSTRING(title, 1, 60) as title,
      quality_score,
      quality_clarity,
      quality_structure,
      quality_completeness,
      quality_reliability,
      SUBSTRING(quality_analysis_summary, 1, 100) as summary
    FROM knowledge_base
    WHERE quality_score IS NOT NULL
    ORDER BY quality_score DESC
    LIMIT 5
  `)

  for (const doc of top.rows) {
    console.log(`   📄 ${doc.title}`)
    console.log(`      Score: ${doc.quality_score}/100 (clarté: ${doc.quality_clarity}, structure: ${doc.quality_structure}, complétude: ${doc.quality_completeness}, fiabilité: ${doc.quality_reliability})`)
    console.log(`      Résumé: ${doc.summary}...\n`)
  }

  // 3. Bottom 5 pires scores
  console.log('\n❌ BOTTOM 5 PIRES SCORES\n')
  const bottom = await pool.query(`
    SELECT
      SUBSTRING(title, 1, 60) as title,
      quality_score,
      quality_clarity,
      quality_structure,
      quality_completeness,
      quality_reliability,
      SUBSTRING(quality_analysis_summary, 1, 150) as summary
    FROM knowledge_base
    WHERE quality_score IS NOT NULL
    ORDER BY quality_score ASC
    LIMIT 5
  `)

  for (const doc of bottom.rows) {
    console.log(`   📄 ${doc.title}`)
    console.log(`      Score: ${doc.quality_score}/100 (clarté: ${doc.quality_clarity}, structure: ${doc.quality_structure}, complétude: ${doc.quality_completeness}, fiabilité: ${doc.quality_reliability})`)
    console.log(`      Résumé: ${doc.summary}...\n`)
  }

  // 4. Statistiques par catégorie
  console.log('\n📂 STATISTIQUES PAR CATÉGORIE\n')
  const cat = await pool.query(`
    SELECT
      category,
      COUNT(*) as total_docs,
      ROUND(AVG(quality_score), 1) as avg_score,
      MIN(quality_score) as min_score,
      MAX(quality_score) as max_score
    FROM knowledge_base
    WHERE quality_score IS NOT NULL
    GROUP BY category
    ORDER BY avg_score DESC
  `)

  for (const row of cat.rows) {
    console.log(`   ${row.category.padEnd(20)} ${row.total_docs.toString().padStart(3)} docs - avg: ${row.avg_score.toString().padStart(4)} (min: ${row.min_score}, max: ${row.max_score})`)
  }

  await pool.end()
}

runAnalysis().catch(console.error)
