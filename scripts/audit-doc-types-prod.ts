#!/usr/bin/env tsx
/**
 * Audit read-only de l'état des doc_type en production
 * Connexion via tunnel SSH : npm run tunnel:start (port 5434)
 */
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya',
  max: 3,
})

async function main() {
  console.log('=== AUDIT doc_type KB — ' + new Date().toISOString() + ' ===\n')

  // 1. Distribution globale category × doc_type
  console.log('--- 1. Distribution category × doc_type ---')
  const dist = await pool.query(`
    SELECT category, doc_type::text, COUNT(*) as n
    FROM knowledge_base
    WHERE is_active = true
    GROUP BY category, doc_type
    ORDER BY category, n DESC
  `)
  for (const r of dist.rows) {
    const ok = isCorrect(r.category, r.doc_type)
    console.log(`  ${r.category.padEnd(20)} | ${(r.doc_type || 'NULL').padEnd(10)} | ${r.n}${ok ? '' : '  ⚠️'}`)
  }

  // 2. Docs avec doc_type NULL
  console.log('\n--- 2. Docs avec doc_type NULL ---')
  const nullDocs = await pool.query(`
    SELECT COUNT(*) as total FROM knowledge_base WHERE doc_type IS NULL AND is_active = true
  `)
  console.log(`  Total NULL : ${nullDocs.rows[0].total}`)
  if (parseInt(nullDocs.rows[0].total) > 0) {
    const nullSample = await pool.query(`
      SELECT category, metadata->>'sourceOrigin' as origin, LEFT(title, 60) as title
      FROM knowledge_base WHERE doc_type IS NULL AND is_active = true LIMIT 10
    `)
    for (const r of nullSample.rows) console.log(`    [${r.origin || 'autre'}] ${r.category} — ${r.title}`)
  }

  // 3. Docs IORT avec category='autre'
  console.log('\n--- 3. Docs IORT category=\'autre\' ---')
  const iortAutre = await pool.query(`
    SELECT COUNT(*) as total FROM knowledge_base
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn' AND category = 'autre' AND is_active = true
  `)
  console.log(`  Total IORT autre : ${iortAutre.rows[0].total}`)
  if (parseInt(iortAutre.rows[0].total) > 0) {
    const iortSample = await pool.query(`
      SELECT norm_level::text as nl, LEFT(regexp_replace(title, chr(1600)::text, '', 'g'), 70) as title
      FROM knowledge_base
      WHERE metadata->>'sourceOrigin' = 'iort_gov_tn' AND category = 'autre' AND is_active = true
      LIMIT 25
    `)
    for (const r of iortSample.rows) console.log(`    [${r.nl || 'null'}] ${r.title}`)
  }

  // 4. Docs needs_review=true par sourceOrigin
  console.log('\n--- 4. Docs needs_review=true ---')
  const review = await pool.query(`
    SELECT metadata->>'sourceOrigin' as origin, COUNT(*) as n
    FROM knowledge_base
    WHERE metadata->>'needs_review' = 'true' AND is_active = true
    GROUP BY origin ORDER BY n DESC
  `)
  if (review.rows.length === 0) console.log('  Aucun doc needs_review=true')
  for (const r of review.rows) console.log(`  [${r.origin || 'null'}] ${r.n} docs`)

  // 5. Chunks avec doc_type désynchronisé
  console.log('\n--- 5. Chunks doc_type désynchronisés ---')
  const desync = await pool.query(`
    SELECT COUNT(*) as total
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kb.is_active = true
      AND kbc.metadata->>'doc_type' IS DISTINCT FROM kb.doc_type::text
  `)
  console.log(`  Chunks désynchronisés : ${desync.rows[0].total}`)

  // 6. Docs Google Drive et leur doc_type actuel
  console.log('\n--- 6. Google Drive docs ---')
  const gdrive = await pool.query(`
    SELECT doc_type::text, category, COUNT(*) as n
    FROM knowledge_base
    WHERE metadata->>'sourceOrigin' = 'google_drive' AND is_active = true
    GROUP BY doc_type, category ORDER BY n DESC
  `)
  if (gdrive.rows.length === 0) console.log('  Aucun doc Google Drive actif')
  for (const r of gdrive.rows) console.log(`  ${r.category.padEnd(20)} | ${(r.doc_type || 'NULL').padEnd(12)} | ${r.n}`)

  // 7. norm_level decret_presidentiel résiduels
  console.log('\n--- 7. Docs norm_level=decret_presidentiel (deprecated) ---')
  const depr = await pool.query(`
    SELECT COUNT(*) as total FROM knowledge_base
    WHERE norm_level = 'decret_presidentiel' AND is_active = true
  `)
  console.log(`  Total decret_presidentiel : ${depr.rows[0].total}`)

  // 8. Résumé par doc_type
  console.log('\n--- 8. Résumé par doc_type ---')
  const summary = await pool.query(`
    SELECT doc_type::text, COUNT(*) as docs,
           SUM(chunk_count) as chunks,
           ROUND(AVG(quality_score)) as avg_quality
    FROM knowledge_base
    WHERE is_active = true
    GROUP BY doc_type ORDER BY docs DESC
  `)
  for (const r of summary.rows) {
    console.log(`  ${(r.doc_type || 'NULL').padEnd(12)} | ${String(r.docs).padStart(5)} docs | ${String(r.chunks || 0).padStart(6)} chunks | qualité moy: ${r.avg_quality || '-'}`)
  }

  await pool.end()
  console.log('\n=== FIN AUDIT ===')
}

function isCorrect(cat: string, type: string | null): boolean {
  const map: Record<string, string> = {
    legislation: 'TEXTES', codes: 'TEXTES', constitution: 'TEXTES',
    conventions: 'TEXTES', jort: 'TEXTES',
    jurisprudence: 'JURIS',
    procedures: 'PROC', formulaires: 'PROC',
    modeles: 'TEMPLATES',
    doctrine: 'DOCTRINE', guides: 'DOCTRINE', lexique: 'DOCTRINE',
    actualites: 'DOCTRINE', autre: 'DOCTRINE',
    google_drive: 'TEMPLATES',
  }
  return map[cat] === type || !map[cat]
}

main().catch(e => { console.error(e); process.exit(1) })
