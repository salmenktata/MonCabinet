import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  const [
    total,
    docTypeDist,
    docTypeNull,
    normDist,
    normNull,
    categoryDist,
    iortAutre,
    gdrive,
    chunksDesync,
    chunkNormDesync,
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM knowledge_base WHERE is_active = true`),
    pool.query(`
      SELECT doc_type, COUNT(*) as n FROM knowledge_base
      WHERE is_active = true GROUP BY doc_type ORDER BY n DESC`),
    pool.query(`SELECT COUNT(*) FROM knowledge_base WHERE doc_type IS NULL AND is_active = true`),
    pool.query(`
      SELECT norm_level, COUNT(*) as n FROM knowledge_base
      WHERE is_active = true AND doc_type = 'TEXTES'
      GROUP BY norm_level ORDER BY n DESC`),
    pool.query(`SELECT COUNT(*) FROM knowledge_base WHERE norm_level IS NULL AND doc_type = 'TEXTES' AND is_active = true`),
    pool.query(`
      SELECT category, doc_type, COUNT(*) as n FROM knowledge_base
      WHERE is_active = true GROUP BY category, doc_type ORDER BY category, n DESC`),
    pool.query(`SELECT COUNT(*) FROM knowledge_base WHERE metadata->>'sourceOrigin' = 'iort_gov_tn' AND category = 'autre' AND is_active = true`),
    pool.query(`SELECT COUNT(*) FROM knowledge_base WHERE category = 'google_drive' AND is_active = true`),
    pool.query(`
      SELECT COUNT(*) as n FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
      WHERE kb.is_active = true
        AND kbc.metadata->>'doc_type' IS DISTINCT FROM kb.doc_type::text`),
    pool.query(`
      SELECT COUNT(*) as n FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
      WHERE kb.is_active = true
        AND kb.doc_type = 'TEXTES'
        AND kb.norm_level IS NOT NULL
        AND kbc.metadata->>'norm_level' IS DISTINCT FROM kb.norm_level::text`),
  ])

  console.log('╔══════════════════════════════════════════════╗')
  console.log('║       AUDIT FINAL — KNOWLEDGE BASE PROD       ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log(`\nTotal docs actifs : ${total.rows[0].count}`)

  console.log('\n── Distribution doc_type ──')
  for (const r of docTypeDist.rows)
    console.log(`  ${(r.doc_type || 'NULL').padEnd(12)} : ${r.n}`)
  console.log(`  [!] doc_type NULL : ${docTypeNull.rows[0].count}`)

  console.log('\n── Distribution norm_level (TEXTES seulement) ──')
  for (const r of normDist.rows)
    console.log(`  ${(r.norm_level || 'NULL').padEnd(25)} : ${r.n}`)
  console.log(`  [!] norm_level NULL : ${normNull.rows[0].count}`)

  console.log('\n── Category × doc_type ──')
  for (const r of categoryDist.rows)
    console.log(`  ${(r.category || 'null').padEnd(18)} | ${(r.doc_type || 'NULL').padEnd(12)} : ${r.n}`)

  console.log('\n── Problèmes détectés ──')
  const issues = []
  if (Number(docTypeNull.rows[0].count) > 0) issues.push(`❌ ${docTypeNull.rows[0].count} docs sans doc_type`)
  if (Number(normNull.rows[0].count) > 0)    issues.push(`⚠️  ${normNull.rows[0].count} TEXTES sans norm_level`)
  if (Number(iortAutre.rows[0].count) > 0)   issues.push(`❌ ${iortAutre.rows[0].count} docs IORT 'autre' restants`)
  if (Number(gdrive.rows[0].count) > 0)      issues.push(`❌ ${gdrive.rows[0].count} docs google_drive non reclassifiés`)
  if (Number(chunksDesync.rows[0].n) > 0)    issues.push(`⚠️  ${chunksDesync.rows[0].n} chunks doc_type désynchronisés`)
  if (Number(chunkNormDesync.rows[0].n) > 0) issues.push(`⚠️  ${chunkNormDesync.rows[0].n} chunks norm_level désynchronisés`)

  if (issues.length === 0) {
    console.log('  ✅ Aucun problème détecté — KB entièrement classifiée')
  } else {
    for (const i of issues) console.log(`  ${i}`)
  }

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
