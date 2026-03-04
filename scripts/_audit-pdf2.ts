import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  // Doc spécifique mentionné par l'utilisateur
  const doc = await pool.query(`
    SELECT id, title, category, doc_type, norm_level, chunk_count,
      is_indexed, rag_enabled, source_file, quality_score,
      metadata->>'sourceOrigin' as origin,
      LEFT(full_text, 400) as excerpt
    FROM knowledge_base WHERE id = '90ee3254-b767-4803-a753-f8d5f0c4c911'`)

  if (doc.rows.length > 0) {
    const d = doc.rows[0]
    console.log('=== Doc 90ee3254 (exemple utilisateur) ===')
    console.log('Title     :', d.title)
    console.log('Category  :', d.category, '| doc_type:', d.doc_type, '| norm_level:', d.norm_level)
    console.log('Origin    :', d.origin)
    console.log('Chunks    :', d.chunk_count, '| quality:', d.quality_score)
    console.log('Indexed   :', d.is_indexed, '| rag_enabled:', d.rag_enabled)
    console.log('Source    :', d.source_file)
    console.log('Excerpt   :', (d.excerpt || '').slice(0, 300))

    const chunks = await pool.query(`
      SELECT LEFT(content, 200) c, LENGTH(content) l, chunk_index
      FROM knowledge_base_chunks WHERE knowledge_base_id='90ee3254-b767-4803-a753-f8d5f0c4c911'
      ORDER BY chunk_index LIMIT 5`)
    console.log('\n=== Chunks (5 premiers) ===')
    for (const c of chunks.rows) console.log(`[#${c.chunk_index} len=${c.l}] ${c.c}`)
  } else {
    console.log('Doc 90ee3254 introuvable')
  }

  // Grande duplication : 1794× même titre
  const bigDup = await pool.query(`
    SELECT category, doc_type, metadata->>'sourceOrigin' as origin,
           LEFT(source_file,80) as sf, COUNT(*) n
    FROM knowledge_base WHERE title='منظومة حقوق المراة التونسية' AND is_active=true
    GROUP BY 1,2,3,4 ORDER BY n DESC LIMIT 10`)
  console.log('\n=== ×1794 "منظومة حقوق المراة التونسية" — distribution ===')
  for (const r of bigDup.rows)
    console.log(`  [${r.n}×] ${r.category} | ${r.doc_type} | ${r.origin} | ${r.sf}`)

  // Titres courts
  const shortTitles = await pool.query(`
    SELECT title, COUNT(*) n FROM knowledge_base WHERE is_active=true AND LENGTH(title)<10
    GROUP BY title ORDER BY n DESC LIMIT 15`)
  console.log('\n=== Top titres < 10 chars ===')
  for (const r of shortTitles.rows)
    console.log(`  [${r.n}×] "${r.title}"`)

  // Stats chunks
  const ocr = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE content IS NULL OR TRIM(content)='') as empty,
      COUNT(*) FILTER (WHERE LENGTH(content) < 50) as too_short,
      COUNT(*) FILTER (WHERE LENGTH(content) BETWEEN 50 AND 200) as short_range,
      COUNT(*) FILTER (WHERE LENGTH(content) > 5000) as very_long,
      ROUND(AVG(LENGTH(content))) as avg_len,
      COUNT(*) as total
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kb.id=kbc.knowledge_base_id
    WHERE kb.is_active=true AND content IS NOT NULL`)
  const oc = ocr.rows[0]
  console.log('\n=== Stats chunks ===')
  console.log(`  Total      : ${oc.total}`)
  console.log(`  Vides      : ${oc.empty}`)
  console.log(`  < 50 chars : ${oc.too_short}`)
  console.log(`  50-200     : ${oc.short_range}`)
  console.log(`  > 5000     : ${oc.very_long}`)
  console.log(`  Moy longueur: ${oc.avg_len} chars`)

  // PDFs IORT avec peu de chunks
  const iortFew = await pool.query(`
    SELECT chunk_count, COUNT(*) n FROM knowledge_base
    WHERE is_active=true AND is_indexed=true
      AND metadata->>'sourceOrigin'='iort_gov_tn'
    GROUP BY chunk_count ORDER BY chunk_count LIMIT 15`)
  console.log('\n=== Distribution chunk_count PDFs IORT ===')
  for (const r of iortFew.rows)
    console.log(`  ${r.chunk_count.toString().padStart(4)} chunks : ${r.n} docs`)

  // Docs avec 0 chunks mais is_indexed=true
  const zeroChunks = await pool.query(`
    SELECT LEFT(title,70) t, category, metadata->>'sourceOrigin' origin, source_file
    FROM knowledge_base
    WHERE is_active=true AND is_indexed=true AND chunk_count=0
    ORDER BY created_at DESC LIMIT 20`)
  console.log(`\n=== Docs indexés mais 0 chunks : ${zeroChunks.rowCount} ===`)
  for (const r of zeroChunks.rows)
    console.log(`  [${r.origin||r.category}] ${r.t} | ${r.source_file}`)

  // Docs legislation GDrive avec titre = nom fichier
  const filenameTitles = await pool.query(`
    SELECT id, title, category, chunk_count, metadata->>'sourceOrigin' origin
    FROM knowledge_base WHERE is_active=true
      AND (title ILIKE '%.pdf' OR title ILIKE '%.doc%' OR title ~ '^[A-Z][A-Za-z0-9_\\-]{4,}\\.(pdf|doc)')
    ORDER BY category, created_at DESC`)
  console.log(`\n=== Docs avec titre = nom de fichier : ${filenameTitles.rowCount} ===`)
  for (const r of filenameTitles.rows)
    console.log(`  [${r.origin||r.category}] [${r.chunk_count}ch] ${r.title}`)

  // Top Microsoft Word titres
  const mswTitles = await pool.query(`
    SELECT title, COUNT(*) n FROM knowledge_base
    WHERE is_active=true AND title ILIKE 'Microsoft Word%'
    GROUP BY title ORDER BY n DESC LIMIT 10`)
  console.log(`\n=== Top titres "Microsoft Word" (959 total) ===`)
  for (const r of mswTitles.rows)
    console.log(`  [${r.n}×] ${r.title}`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
