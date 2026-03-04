import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║        AUDIT QUALITÉ CONTENU INDEXÉ — PDFs & KB          ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')

  // 1. Titres suspects (noms de fichiers, OCR raté, vides)
  const [titleFilename, titleWord, titleEmpty, titleShort, titleDuplicate] = await Promise.all([
    pool.query(`
      SELECT id, LEFT(title,90) t, source_file, category
      FROM knowledge_base WHERE is_active=true
        AND (title ILIKE '%.pdf' OR title ILIKE '%.doc%' OR title ILIKE '%.xls%'
          OR title ~ '^[A-Z0-9_\-]{5,}\.(pdf|doc|xls)')
      ORDER BY created_at DESC LIMIT 20`),
    pool.query(`
      SELECT COUNT(*) n FROM knowledge_base WHERE is_active=true
        AND title ILIKE 'Microsoft Word%'`),
    pool.query(`
      SELECT COUNT(*) n FROM knowledge_base WHERE is_active=true
        AND (title IS NULL OR TRIM(title) = '')`),
    pool.query(`
      SELECT COUNT(*) n FROM knowledge_base WHERE is_active=true
        AND LENGTH(title) < 10`),
    pool.query(`
      SELECT title, COUNT(*) n FROM knowledge_base WHERE is_active=true
        AND title IS NOT NULL AND LENGTH(title) > 5
      GROUP BY title HAVING COUNT(*) > 1
      ORDER BY n DESC LIMIT 15`),
  ])

  console.log('── Titres suspects ──')
  console.log(`  Titres = nom de fichier (.pdf/.doc)  : ${titleFilename.rowCount}`)
  for (const r of titleFilename.rows)
    console.log(`    [${r.category}] ${r.t}`)

  console.log(`\n  Titres "Microsoft Word - ..."        : ${titleWord.rows[0].n}`)
  console.log(`  Titres vides                          : ${titleEmpty.rows[0].n}`)
  console.log(`  Titres < 10 chars                     : ${titleShort.rows[0].n}`)
  console.log('\n  Titres en doublon :')
  for (const r of titleDuplicate.rows)
    console.log(`    ×${r.n}  ${r.title}`)

  // 2. Contenu des chunks : qualité OCR
  const [chunkEmpty, chunkVeryShort, chunkGarbled, chunkBinaryPdf, chunkLatinOnly, chunkStats] = await Promise.all([
    pool.query(`
      SELECT COUNT(*) n FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id=kbc.knowledge_base_id
      WHERE kb.is_active=true AND (kbc.content IS NULL OR TRIM(kbc.content)='')`),
    pool.query(`
      SELECT COUNT(*) n FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id=kbc.knowledge_base_id
      WHERE kb.is_active=true AND LENGTH(kbc.content) < 50`),
    // Chunks avec % élevé de caractères non-alphanumériques (OCR corrompu)
    pool.query(`
      SELECT COUNT(*) n FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id=kbc.knowledge_base_id
      WHERE kb.is_active=true
        AND LENGTH(kbc.content) > 100
        AND (LENGTH(regexp_replace(kbc.content, '[\\w\\s\\u0600-\\u06FF.,;:()\\/\\'\"\\-]', '', 'g'))::float
             / LENGTH(kbc.content)) > 0.30`),
    // Chunks ressemblant à du binaire PDF (%PDF, objets PDF)
    pool.query(`
      SELECT COUNT(*) n FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id=kbc.knowledge_base_id
      WHERE kb.is_active=true AND kbc.content ILIKE '%obj%endobj%'`),
    // Docs IORT supposément arabes mais en latin uniquement
    pool.query(`
      SELECT kb.id, LEFT(kb.title,70) title, kb.chunk_count,
             LEFT(kbc.content, 200) sample
      FROM knowledge_base kb
      JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_active=true
        AND kb.metadata->>'sourceOrigin' = 'iort_gov_tn'
        AND LENGTH(kbc.content) > 100
        AND kbc.content !~ '[\u0600-\u06FF]'
      LIMIT 10`),
    // Stats générales chunks
    pool.query(`
      SELECT
        COUNT(*) total,
        ROUND(AVG(LENGTH(content))) avg_len,
        MIN(LENGTH(content)) min_len,
        MAX(LENGTH(content)) max_len,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY LENGTH(content)) median_len
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id=kbc.knowledge_base_id
      WHERE kb.is_active=true AND content IS NOT NULL`),
  ])

  console.log('\n── Qualité chunks ──')
  const s = chunkStats.rows[0]
  console.log(`  Total chunks actifs  : ${s.total}`)
  console.log(`  Longueur moy/med     : ${s.avg_len} / ${Math.round(s.median_len)} chars`)
  console.log(`  Min / Max            : ${s.min_len} / ${s.max_len} chars`)
  console.log(`  Chunks vides         : ${chunkEmpty.rows[0].n}`)
  console.log(`  Chunks < 50 chars    : ${chunkVeryShort.rows[0].n}`)
  console.log(`  Chunks OCR corrompu (>30% chars spéciaux) : ${chunkGarbled.rows[0].n}`)
  console.log(`  Chunks binaire PDF   : ${chunkBinaryPdf.rows[0].n}`)

  if (chunkLatinOnly.rows.length > 0) {
    console.log('\n  ⚠️  Docs IORT avec contenu latin (OCR raté ou mauvaise langue) :')
    for (const r of chunkLatinOnly.rows)
      console.log(`    [${r.chunk_count} chunks] ${r.title}\n      ${r.sample.slice(0,100)}`)
  }

  // 3. Docs PDF avec très peu de contenu (OCR silencieux)
  const [pdfFewChunks, pdfNoContent] = await Promise.all([
    pool.query(`
      SELECT id, LEFT(title,80) t, chunk_count, source_file, category,
             metadata->>'sourceOrigin' origin
      FROM knowledge_base
      WHERE is_active=true AND is_indexed=true
        AND chunk_count <= 2
        AND (source_file ILIKE '%.pdf' OR metadata->>'fileType' = 'pdf'
             OR metadata->>'sourceOrigin' = 'iort_gov_tn')
      ORDER BY chunk_count, created_at DESC
      LIMIT 25`),
    pool.query(`
      SELECT COUNT(*) n FROM knowledge_base
      WHERE is_active=true AND is_indexed=true AND chunk_count = 0`),
  ])

  console.log('\n── PDFs avec peu de chunks (OCR silencieux / contenu trop court) ──')
  console.log(`  Docs indexés avec 0 chunks : ${pdfNoContent.rows[0].n}`)
  console.log(`  PDFs avec ≤ 2 chunks (sample) :`)
  for (const r of pdfFewChunks.rows)
    console.log(`    [${r.chunk_count}ch] [${r.origin||r.category}] ${r.t}`)

  // 4. Distribution chunk_count pour les PDFs
  const chunkDist = await pool.query(`
    SELECT chunk_count, COUNT(*) n FROM knowledge_base
    WHERE is_active=true AND is_indexed=true
      AND (source_file ILIKE '%.pdf' OR metadata->>'sourceOrigin'='iort_gov_tn')
    GROUP BY chunk_count ORDER BY chunk_count
    LIMIT 20`)
  console.log('\n── Distribution chunk_count (PDFs) ──')
  for (const r of chunkDist.rows)
    console.log(`  ${r.chunk_count.toString().padStart(4)} chunks : ${r.n} docs`)

  // 5. Docs avec full_text très court vs chunk_count élevé (découpage anormal)
  const abnormal = await pool.query(`
    SELECT LEFT(title,70) t, chunk_count,
           LENGTH(full_text) full_text_len,
           metadata->>'sourceOrigin' origin
    FROM knowledge_base
    WHERE is_active=true AND is_indexed=true
      AND chunk_count > 10
      AND full_text IS NOT NULL
      AND LENGTH(full_text) < 1000
    ORDER BY chunk_count DESC
    LIMIT 10`)
  if (abnormal.rows.length > 0) {
    console.log('\n── Docs avec chunk_count élevé mais full_text court (anomalie) ──')
    for (const r of abnormal.rows)
      console.log(`  [${r.chunk_count}ch / ${r.full_text_len}chars] [${r.origin}] ${r.t}`)
  }

  // 6. PDFs IORT — vérifier cohérence titre vs contenu
  const iortCheck = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE chunk_count = 0) zero_chunks,
      COUNT(*) FILTER (WHERE chunk_count BETWEEN 1 AND 3) few_chunks,
      COUNT(*) FILTER (WHERE chunk_count > 100) many_chunks,
      COUNT(*) total,
      ROUND(AVG(chunk_count)) avg_chunks
    FROM knowledge_base
    WHERE is_active=true AND metadata->>'sourceOrigin'='iort_gov_tn'`)
  const ic = iortCheck.rows[0]
  console.log('\n── Stats PDFs IORT ──')
  console.log(`  Total      : ${ic.total}`)
  console.log(`  0 chunks   : ${ic.zero_chunks}  ← à réindexer`)
  console.log(`  1-3 chunks : ${ic.few_chunks}  ← potentiellement OCR raté`)
  console.log(`  >100 chunks: ${ic.many_chunks}  ← gros documents (normal)`)
  console.log(`  Avg chunks : ${ic.avg_chunks}`)

  // 7. Résumé problèmes
  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║                    RÉSUMÉ PROBLÈMES                       ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  const problems = []
  if (Number(titleFilename.rowCount) > 0)       problems.push(`🔴 ${titleFilename.rowCount} docs avec titre = nom de fichier`)
  if (Number(titleWord.rows[0].n) > 0)          problems.push(`🟡 ${titleWord.rows[0].n} titres "Microsoft Word - ..."`)
  if (Number(titleEmpty.rows[0].n) > 0)         problems.push(`🔴 ${titleEmpty.rows[0].n} docs sans titre`)
  if (Number(titleDuplicate.rows.length) > 0)   problems.push(`🟡 ${titleDuplicate.rows.length} titres en doublon`)
  if (Number(chunkEmpty.rows[0].n) > 0)         problems.push(`🔴 ${chunkEmpty.rows[0].n} chunks vides`)
  if (Number(chunkVeryShort.rows[0].n) > 0)     problems.push(`🟡 ${chunkVeryShort.rows[0].n} chunks < 50 chars`)
  if (Number(chunkGarbled.rows[0].n) > 0)       problems.push(`🟠 ${chunkGarbled.rows[0].n} chunks OCR corrompu`)
  if (Number(chunkBinaryPdf.rows[0].n) > 0)     problems.push(`🔴 ${chunkBinaryPdf.rows[0].n} chunks binaire PDF`)
  if (Number(pdfNoContent.rows[0].n) > 0)       problems.push(`🔴 ${pdfNoContent.rows[0].n} docs indexés sans aucun chunk`)
  if (Number(ic.zero_chunks) > 0)               problems.push(`🟠 ${ic.zero_chunks} PDFs IORT sans chunk`)
  if (Number(ic.few_chunks) > 5)                problems.push(`🟡 ${ic.few_chunks} PDFs IORT avec 1-3 chunks (OCR partiel ?)`)
  if (chunkLatinOnly.rows.length > 0)           problems.push(`🟠 ${chunkLatinOnly.rows.length} docs IORT avec contenu latin (OCR langue erronée)`)

  for (const p of problems) console.log(`  ${p}`)
  if (problems.length === 0) console.log('  ✅ Aucun problème détecté')

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
