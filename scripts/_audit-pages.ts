import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  // 1. KB docs depuis sources web (par sourceOrigin)
  const webSources = await pool.query(`
    SELECT
      metadata->>'sourceOrigin' as origin,
      category,
      doc_type,
      COUNT(*) as n
    FROM knowledge_base
    WHERE is_active=true
      AND metadata->>'sourceOrigin' IS NOT NULL
    GROUP BY origin, category, doc_type
    ORDER BY origin, n DESC`)

  console.log('=== KB docs par sourceOrigin/catégorie/doc_type ===')
  for (const r of webSources.rows)
    console.log(`  ${(r.origin||'null').padEnd(18)} | ${r.category.padEnd(20)} | ${(r.doc_type||'NULL').padEnd(10)} | ${r.n}`)

  // 2. KB docs sans sourceOrigin mais avec web_page_id
  const webPageLinked = await pool.query(`
    SELECT kb.category, kb.doc_type, COUNT(*) as n
    FROM knowledge_base kb
    WHERE kb.is_active=true
      AND kb.metadata->>'sourceOrigin' IS NULL
      AND EXISTS (SELECT 1 FROM web_pages wp WHERE wp.id::text = kb.metadata->>'webPageId')
    GROUP BY kb.category, kb.doc_type
    ORDER BY n DESC
    LIMIT 10`)
  console.log('\n=== KB liés à web_pages sans sourceOrigin ===')
  for (const r of webPageLinked.rows)
    console.log(`  ${r.category.padEnd(20)} | ${(r.doc_type||'NULL').padEnd(10)} | ${r.n}`)

  // 3. Web pages table : distribution par doc_type / category
  const wpDist = await pool.query(`
    SELECT
      ws.category as source_category,
      wp.is_indexed,
      wp.rag_enabled,
      COUNT(*) as n
    FROM web_pages wp
    JOIN web_sources ws ON ws.id = wp.web_source_id
    WHERE wp.is_active = true
    GROUP BY ws.category, wp.is_indexed, wp.rag_enabled
    ORDER BY n DESC
    LIMIT 20`)
  console.log('\n=== web_pages par category/is_indexed/rag_enabled ===')
  for (const r of wpDist.rows)
    console.log(`  ${(r.source_category||'null').padEnd(20)} | indexed:${r.is_indexed} rag:${r.rag_enabled} | ${r.n}`)

  // 4. Problèmes : KB avec catégorie incohérente par rapport au sourceOrigin
  const inconsistent = await pool.query(`
    SELECT
      metadata->>'sourceOrigin' as origin,
      category,
      COUNT(*) as n
    FROM knowledge_base
    WHERE is_active=true
      AND metadata->>'sourceOrigin' IN ('iort_gov_tn','9anoun_tn','justice_gov_tn','cassation_tn')
      AND category NOT IN ('legislation','jort','codes','constitution','jurisprudence','jurisprudence','conventions')
    GROUP BY origin, category
    ORDER BY origin, n DESC`)
  console.log('\n=== KB web avec catégorie potentiellement incorrecte ===')
  if (inconsistent.rows.length === 0) console.log('  (aucun)')
  for (const r of inconsistent.rows)
    console.log(`  ${(r.origin||'null').padEnd(20)} | ${r.category.padEnd(20)} | ${r.n}`)

  // 5. Chunks désynchronisés (norm_level)
  const chunkNorm = await pool.query(`
    SELECT COUNT(*) as n FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
    WHERE kb.is_active=true
      AND kb.norm_level IS NOT NULL
      AND kbc.metadata->>'norm_level' IS DISTINCT FROM kb.norm_level::text`)
  console.log(`\nChunks norm_level désynchronisés: ${chunkNorm.rows[0].n}`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
