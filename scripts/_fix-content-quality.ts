import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║           FIX QUALITÉ CONTENU KB — PROD                   ║')
  console.log('╚══════════════════════════════════════════════════════════╝\n')

  // ── 1. WRCATI — pages de navigation (1794 docs) → rag_enabled=false ──
  const fix1 = await pool.query(`
    UPDATE knowledge_base SET
      rag_enabled = false,
      metadata = metadata || jsonb_build_object(
        'rag_disabled_reason', 'wrcati_navigation_page',
        'rag_disabled_at', NOW()::text
      ),
      updated_at = NOW()
    WHERE is_active = true
      AND title = 'منظومة حقوق المراة التونسية'
      AND source_file ILIKE '%wrcati.cawtar.org%'
    RETURNING id`)
  console.log(`1. WRCATI pages navigation → rag_enabled=false : ${fix1.rowCount}`)

  // ── 2. Titres "REPUBLIQUE TUNISIENNE" (67 occurrences) → rag_enabled=false ──
  const fix2 = await pool.query(`
    UPDATE knowledge_base SET
      rag_enabled = false,
      metadata = metadata || jsonb_build_object('rag_disabled_reason', 'generic_header_title'),
      updated_at = NOW()
    WHERE is_active = true
      AND title IN ('REPUBLIQUE TUNISIENNE', 'الجمهورية التونسية')
      AND chunk_count <= 2
    RETURNING id`)
  console.log(`2. Titres en-têtes génériques (≤2 chunks) → rag_enabled=false : ${fix2.rowCount}`)

  // ── 3. Titres "Microsoft Word - " → strip le préfixe ──
  const fix3 = await pool.query(`
    UPDATE knowledge_base SET
      title = REGEXP_REPLACE(
        REGEXP_REPLACE(title, '^Microsoft Word - ', ''),
        '\\.docx?$', '', 'i'
      ),
      metadata = metadata || jsonb_build_object('title_fixed_msword', true),
      updated_at = NOW()
    WHERE is_active = true
      AND title ILIKE 'Microsoft Word - %'
    RETURNING id, LEFT(title,60) as new_title`)
  console.log(`3. Titres "Microsoft Word - " strippés : ${fix3.rowCount}`)
  // Afficher quelques exemples
  for (const r of fix3.rows.slice(0, 5)) console.log(`   → "${r.new_title}"`)
  if (fix3.rowCount > 5) console.log(`   ... et ${fix3.rowCount - 5} autres`)

  // ── 4. Titres = noms de fichiers → nettoyer l'extension et les underscores ──
  // Ex: "غسل الأموال.doc" → "غسل الأموال"
  // Ex: "ViolenceSexuelConventionDroitEnfant.pdf" → "ViolenceSexuel Convention Droit Enfant"
  const fix4a = await pool.query(`
    UPDATE knowledge_base SET
      title = TRIM(REGEXP_REPLACE(
        REGEXP_REPLACE(title, '\\.(pdf|docx?|xlsx?|pptx?)$', '', 'i'),
        '[_\\-]+', ' ', 'g'
      )),
      metadata = metadata || jsonb_build_object('title_fixed_filename', true),
      updated_at = NOW()
    WHERE is_active = true
      AND (title ~* '\\.(pdf|docx?|xlsx?)$')
    RETURNING id, LEFT(title,70) as new_title`)
  console.log(`\n4. Titres = noms de fichiers (extension strippée) : ${fix4a.rowCount}`)
  for (const r of fix4a.rows.slice(0, 5)) console.log(`   → "${r.new_title}"`)
  if (fix4a.rowCount > 5) console.log(`   ... et ${fix4a.rowCount - 5} autres`)

  // ── 5. Titres fragments OCR < 10 chars non vides → rag_enabled=false ──
  // ("ل/الح", "س*ع", "ع/س" etc.)
  const fix5 = await pool.query(`
    UPDATE knowledge_base SET
      rag_enabled = false,
      metadata = metadata || jsonb_build_object('rag_disabled_reason', 'ocr_fragment_title'),
      updated_at = NOW()
    WHERE is_active = true
      AND LENGTH(TRIM(title)) < 8
      AND title !~ '^[0-9]+$'
      AND title NOT IN ('ACCORD', 'PROTOCOLE', 'الفسخ')
    RETURNING id, title`)
  console.log(`\n5. Titres fragments OCR (< 8 chars) → rag_enabled=false : ${fix5.rowCount}`)
  for (const r of fix5.rows) console.log(`   "${r.title}"`)

  // ── 6. Titre vide → "Document sans titre" ──
  const fix6 = await pool.query(`
    UPDATE knowledge_base SET
      title = 'Document sans titre',
      metadata = metadata || jsonb_build_object('title_was_empty', true),
      updated_at = NOW()
    WHERE is_active = true AND (title IS NULL OR TRIM(title) = '')
    RETURNING id`)
  console.log(`\n6. Titres vides corrigés : ${fix6.rowCount}`)

  // ── 7. PDFs OCR garblés (justice.gov.tn Arabe PDFs) → rag_enabled=false + marquage ──
  // Ces PDFs ont des polices non-Unicode → OCR produit de l'ASCII charabia
  // Détection : source_file de justice.gov.tn + category codes + chunks avec < 10% chars arabes
  const ocrGarbled = await pool.query(`
    SELECT DISTINCT kb.id, kb.title, kb.source_file
    FROM knowledge_base kb
    JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
    WHERE kb.is_active = true
      AND kb.source_file ILIKE '%justice.gov.tn%'
      AND kb.category IN ('codes', 'legislation')
      AND LENGTH(kbc.content) > 200
      AND (
        LENGTH(regexp_replace(kbc.content, '[^\u0600-\u06FF]', '', 'g'))::float
        / NULLIF(LENGTH(kbc.content), 0)
      ) < 0.05
    LIMIT 50`)
  console.log(`\n7. PDFs OCR garblés détectés (justice.gov.tn) : ${ocrGarbled.rowCount}`)
  for (const r of ocrGarbled.rows) console.log(`   ${r.title}`)

  if (ocrGarbled.rowCount > 0) {
    const ids = ocrGarbled.rows.map(r => `'${r.id}'`).join(',')
    const fix7 = await pool.query(`
      UPDATE knowledge_base SET
        rag_enabled = false,
        metadata = metadata || jsonb_build_object(
          'ocr_garbled', true,
          'rag_disabled_reason', 'ocr_non_unicode_fonts',
          'rag_disabled_at', NOW()::text
        ),
        updated_at = NOW()
      WHERE id IN (${ids})
      RETURNING id`)
    console.log(`   → ${fix7.rowCount} docs marqués rag_enabled=false`)
  }

  // ── 8. planning_21-22.pdf × 97 → rag_enabled=false ──
  const fix8 = await pool.query(`
    UPDATE knowledge_base SET
      rag_enabled = false,
      metadata = metadata || jsonb_build_object('rag_disabled_reason', 'duplicate_planning_file'),
      updated_at = NOW()
    WHERE is_active = true AND title = 'planning_21-22.pdf'
    RETURNING id`)
  console.log(`\n8. planning_21-22.pdf × 97 → rag_enabled=false : ${fix8.rowCount}`)

  // ── 9. Résumé final ──
  const stats = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE rag_enabled = true AND is_active = true) as rag_active,
      COUNT(*) FILTER (WHERE rag_enabled = false AND is_active = true) as rag_disabled,
      COUNT(*) FILTER (WHERE title ILIKE 'Microsoft Word%' AND is_active = true) as msword_remaining,
      COUNT(*) FILTER (WHERE title ~* '\\.(pdf|docx?)$' AND is_active = true) as filename_remaining,
      COUNT(*) FILTER (WHERE LENGTH(title) < 8 AND is_active = true) as short_title_remaining
    FROM knowledge_base`)
  const s = stats.rows[0]
  console.log('\n── Résumé final ──')
  console.log(`  Docs RAG actifs  : ${s.rag_active}`)
  console.log(`  Docs RAG désactivés : ${s.rag_disabled}`)
  console.log(`  Titres MSWord restants  : ${s.msword_remaining}`)
  console.log(`  Titres = fichier restants: ${s.filename_remaining}`)
  console.log(`  Titres < 8 chars restants: ${s.short_title_remaining}`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
