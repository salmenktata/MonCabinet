import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  console.log('=== Fix qualité complémentaire ===\n')

  // 1. Titres hex-encodés <4D6963726F736F66...> → rag_enabled=false + titre nettoyé
  const fix1 = await pool.query(`
    UPDATE knowledge_base SET
      rag_enabled = false,
      title = 'Document (titre corrompu)',
      metadata = metadata || jsonb_build_object(
        'title_was_hex_encoded', true,
        'rag_disabled_reason', 'hex_encoded_title'
      ),
      updated_at = NOW()
    WHERE is_active = true
      AND title ~ '^<[0-9A-Fa-f]{20,}>'
    RETURNING id, LEFT(title,60) as t`)
  console.log(`1. Titres hex-encodés → nettoyés + rag_off : ${fix1.rowCount}`)
  for (const r of fix1.rows) console.log(`   ${r.t}`)

  // 2. Titres encodage ISO corrompu (ex: ÃãÑ = أمر en ISO-8859-1)
  // Caractères latin étendu où on attend de l'arabe
  const fix2 = await pool.query(`
    UPDATE knowledge_base SET
      rag_enabled = false,
      title = 'Document (encodage corrompu)',
      metadata = metadata || jsonb_build_object(
        'title_was_iso_encoded', true,
        'rag_disabled_reason', 'iso_corrupted_title'
      ),
      updated_at = NOW()
    WHERE is_active = true
      AND title ~ '[ÃãÑÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæ]'
      AND title !~ '[\u0600-\u06FF]'
      AND LENGTH(title) < 20
    RETURNING id, title`)
  console.log(`\n2. Titres encodage ISO corrompu : ${fix2.rowCount}`)
  for (const r of fix2.rows) console.log(`   "${r.title}"`)

  // 3. planning_21-22 doublons (97 docs, même planning → rag_enabled=false sauf 1)
  const planning = await pool.query(`
    SELECT id FROM knowledge_base WHERE is_active=true AND title='planning_21-22'
    ORDER BY chunk_count DESC, created_at ASC`)
  if (planning.rows.length > 1) {
    // Garder le premier (plus de chunks), désactiver les autres
    const toDisable = planning.rows.slice(1).map(r => `'${r.id}'`).join(',')
    const fix3 = await pool.query(`
      UPDATE knowledge_base SET
        rag_enabled = false,
        metadata = metadata || jsonb_build_object('rag_disabled_reason', 'duplicate_planning'),
        updated_at = NOW()
      WHERE id IN (${toDisable})
      RETURNING id`)
    console.log(`\n3. planning_21-22 doublons désactivés : ${fix3.rowCount} (1 conservé)`)
  } else {
    console.log(`\n3. planning_21-22 : ${planning.rows.length} doc (déjà OK)`)
  }

  // 4. Doublons massifs cassation "محكمة التعقيب :فقه القضاء" × 92
  const cassFix = await pool.query(`
    SELECT id, chunk_count FROM knowledge_base
    WHERE is_active=true AND title='محكمة التعقيب :فقه القضاء'
    ORDER BY chunk_count DESC, created_at ASC`)
  if (cassFix.rows.length > 1) {
    const toDisable = cassFix.rows.slice(1).map(r => `'${r.id}'`).join(',')
    const fix4 = await pool.query(`
      UPDATE knowledge_base SET rag_enabled=false,
        metadata=metadata||'{"rag_disabled_reason":"duplicate_cassation"}'::jsonb, updated_at=NOW()
      WHERE id IN (${toDisable}) RETURNING id`)
    console.log(`4. "محكمة التعقيب :فقه القضاء" doublons : ${fix4.rowCount} désactivés (1 conservé)`)
  }

  // 5. "La majoration de 25%" × 62 doublons
  const majFix = await pool.query(`
    SELECT id FROM knowledge_base
    WHERE is_active=true AND title ILIKE '%majoration de 25%%'
    ORDER BY chunk_count DESC, created_at ASC`)
  if (majFix.rows.length > 1) {
    const toDisable = majFix.rows.slice(1).map(r => `'${r.id}'`).join(',')
    const fix5 = await pool.query(`
      UPDATE knowledge_base SET rag_enabled=false,
        metadata=metadata||'{"rag_disabled_reason":"duplicate_tva_article"}'::jsonb, updated_at=NOW()
      WHERE id IN (${toDisable}) RETURNING id`)
    console.log(`5. "La majoration de 25%" doublons : ${fix5.rowCount} désactivés`)
  }

  // 6. Sync metadata.rag_enabled vers chunks
  const sync = await pool.query(`
    UPDATE knowledge_base_chunks kbc
    SET metadata = kbc.metadata || jsonb_build_object('rag_enabled', kb.rag_enabled)
    FROM knowledge_base kb
    WHERE kbc.knowledge_base_id = kb.id
      AND kb.is_active = true
      AND (kbc.metadata->>'rag_enabled')::boolean IS DISTINCT FROM kb.rag_enabled`)
  console.log(`\n6. Chunks metadata.rag_enabled synced : ${sync.rowCount}`)

  // 7. Vérification finale
  const final = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE rag_enabled=true AND is_active=true) as rag_on,
      COUNT(*) FILTER (WHERE rag_enabled=false AND is_active=true) as rag_off,
      COUNT(*) FILTER (WHERE title ~ '^<[0-9A-Fa-f]+>' AND is_active=true) as hex_titles,
      COUNT(*) FILTER (WHERE title ILIKE 'Microsoft Word%' AND is_active=true) as msword,
      COUNT(*) FILTER (WHERE title ~* '\\.(pdf|docx?)$' AND is_active=true) as filename_ext
    FROM knowledge_base`)
  const f = final.rows[0]
  console.log('\n── État final ──')
  console.log(`  RAG actifs   : ${f.rag_on}`)
  console.log(`  RAG désact.  : ${f.rag_off}`)
  console.log(`  Titres hex   : ${f.hex_titles}`)
  console.log(`  Titres MSWord: ${f.msword}`)
  console.log(`  Titres .pdf  : ${f.filename_ext}`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
