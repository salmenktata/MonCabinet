import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  const [
    kbTotal,
    kbDocType,
    kbNormNull,
    kbCategoryOdd,
    chunksTotal,
    chunksDesyncDocType,
    chunksDesyncNorm,
    chunksNoEmbedding,
    webPagesTotal,
    webPagesKbMissing,
    kbSourceDist,
    kbInactiveIndexed,
  ] = await Promise.all([
    // KB stats
    pool.query(`SELECT COUNT(*) FROM knowledge_base WHERE is_active=true`),
    pool.query(`
      SELECT doc_type, COUNT(*) n FROM knowledge_base WHERE is_active=true
      GROUP BY doc_type ORDER BY n DESC`),
    pool.query(`
      SELECT COUNT(*) FROM knowledge_base
      WHERE is_active=true AND doc_type='TEXTES' AND norm_level IS NULL`),
    pool.query(`
      SELECT category, doc_type, COUNT(*) n FROM knowledge_base
      WHERE is_active=true
        AND (
          (category IN ('legislation','codes','constitution','conventions','jort') AND doc_type != 'TEXTES')
          OR (category='jurisprudence' AND doc_type != 'JURIS')
          OR (category IN ('modeles') AND doc_type != 'TEMPLATES')
        )
      GROUP BY category, doc_type ORDER BY n DESC`),

    // Chunks stats
    pool.query(`SELECT COUNT(*) FROM knowledge_base_chunks kbc JOIN knowledge_base kb ON kb.id=kbc.knowledge_base_id WHERE kb.is_active=true`),
    pool.query(`
      SELECT COUNT(*) n FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id=kbc.knowledge_base_id
      WHERE kb.is_active=true
        AND kbc.metadata->>'doc_type' IS DISTINCT FROM kb.doc_type::text`),
    pool.query(`
      SELECT COUNT(*) n FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id=kbc.knowledge_base_id
      WHERE kb.is_active=true AND kb.doc_type='TEXTES' AND kb.norm_level IS NOT NULL
        AND kbc.metadata->>'norm_level' IS DISTINCT FROM kb.norm_level::text`),
    pool.query(`
      SELECT COUNT(*) n FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id=kbc.knowledge_base_id
      WHERE kb.is_active=true AND kbc.embedding IS NULL`),

    // web_pages
    pool.query(`SELECT COUNT(*) FROM web_pages WHERE is_indexed=true`),
    pool.query(`
      SELECT COUNT(*) n FROM web_pages wp
      WHERE wp.is_indexed=true AND wp.knowledge_base_id IS NULL`),

    // Distribution par sourceOrigin
    pool.query(`
      SELECT metadata->>'sourceOrigin' as origin, COUNT(*) n
      FROM knowledge_base WHERE is_active=true
      GROUP BY origin ORDER BY n DESC`),

    // Docs inactifs mais indexés
    pool.query(`
      SELECT COUNT(*) FROM knowledge_base WHERE is_active=false AND is_indexed=true`),
  ])

  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║         CHECK GLOBAL PROD — KNOWLEDGE BASE        ║')
  console.log('╚══════════════════════════════════════════════════╝')

  console.log(`\n── Knowledge Base (${kbTotal.rows[0].count} docs actifs) ──`)
  for (const r of kbDocType.rows)
    console.log(`  ${(r.doc_type||'NULL').padEnd(12)} : ${r.n}`)

  console.log(`\n── Chunks (${chunksTotal.rows[0].count} total) ──`)
  console.log(`  Sans embedding Ollama  : ${chunksNoEmbedding.rows[0].n}`)
  console.log(`  doc_type désynchronisé : ${chunksDesyncDocType.rows[0].n}`)
  console.log(`  norm_level désync      : ${chunksDesyncNorm.rows[0].n}`)

  console.log(`\n── Web Pages (${webPagesTotal.rows[0].count} indexed) ──`)
  console.log(`  Sans knowledge_base_id : ${webPagesKbMissing.rows[0].n}`)

  console.log('\n── Source Origin ──')
  for (const r of kbSourceDist.rows)
    console.log(`  ${(r.origin||'null').padEnd(20)} : ${r.n}`)

  console.log(`\n── Divers ──`)
  console.log(`  Docs inactifs indexés  : ${kbInactiveIndexed.rows[0].count}  (normal — sources désactivées post-indexation)`)
  console.log(`  TEXTES norm_level NULL : ${kbNormNull.rows[0].count}`)

  if (kbCategoryOdd.rows.length > 0) {
    console.log('\n  ⚠️  Category/doc_type incohérents :')
    for (const r of kbCategoryOdd.rows)
      console.log(`    ${r.category} | ${r.doc_type} : ${r.n}`)
  }

  console.log('\n── Verdict ──')
  const issues = []
  if (Number(kbNormNull.rows[0].count) > 0)           issues.push(`❌ ${kbNormNull.rows[0].count} TEXTES sans norm_level`)
  if (Number(chunksDesyncDocType.rows[0].n) > 0)      issues.push(`❌ ${chunksDesyncDocType.rows[0].n} chunks doc_type désync`)
  if (Number(chunksDesyncNorm.rows[0].n) > 0)         issues.push(`❌ ${chunksDesyncNorm.rows[0].n} chunks norm_level désync`)
  if (Number(webPagesKbMissing.rows[0].n) > 0)        issues.push(`⚠️  ${webPagesKbMissing.rows[0].n} web_pages indexed sans KB entry`)
  if (kbCategoryOdd.rows.length > 0)                  issues.push(`⚠️  ${kbCategoryOdd.rows.length} category/doc_type incohérents`)
  if (Number(chunksNoEmbedding.rows[0].n) > 0)        issues.push(`⚠️  ${chunksNoEmbedding.rows[0].n} chunks sans embedding Ollama (backfill en cours)`)

  if (issues.length === 0) console.log('  ✅ Tout est propre')
  else for (const i of issues) console.log(`  ${i}`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
