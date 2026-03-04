#!/usr/bin/env tsx
/**
 * Corrige les doc_type incorrects dans knowledge_base
 * et backfill norm_level pour les TEXTES sans norm_level
 */
import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  // 1. Corriger doc_type selon la catégorie (source de vérité = category)
  const fixes = [
    { cat: 'legislation', type: 'TEXTES' },
    { cat: 'jort',        type: 'TEXTES' },
    { cat: 'codes',       type: 'TEXTES' },
    { cat: 'conventions', type: 'TEXTES' },
    { cat: 'constitution',type: 'TEXTES' },
    { cat: 'lexique',     type: 'DOCTRINE' },
    { cat: 'jurisprudence', type: 'JURIS' },
    { cat: 'doctrine',    type: 'DOCTRINE' },
    { cat: 'guides',      type: 'DOCTRINE' },
    { cat: 'actualites',  type: 'DOCTRINE' },
    { cat: 'autre',       type: 'DOCTRINE' },
    { cat: 'modeles',     type: 'TEMPLATES' },
    { cat: 'procedures',  type: 'PROC' },
    { cat: 'formulaires', type: 'PROC' },
  ]

  console.log('=== CORRECTION doc_type ===')
  for (const { cat, type } of fixes) {
    const r = await pool.query(`
      UPDATE knowledge_base SET
        doc_type = $1::document_type,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('doc_type', $1),
        updated_at = NOW()
      WHERE category = $2 AND is_active = true
        AND (doc_type IS DISTINCT FROM $1::document_type)
    `, [type, cat])
    if (r.rowCount! > 0) console.log(`  ${cat.padEnd(20)} → ${type.padEnd(10)} : ${r.rowCount} docs corrigés`)
  }

  // 2. Backfill norm_level pour TEXTES sans norm_level
  console.log('\n=== BACKFILL norm_level TEXTES ===')
  const normFix = await pool.query(`
    UPDATE knowledge_base SET
      norm_level = CASE
        WHEN category = 'constitution'   THEN 'constitution'
        WHEN category = 'conventions'    THEN 'traite_international'
        WHEN subcategory = 'loi_organique' THEN 'loi_organique'
        WHEN subcategory IN ('coc','code_penal','code_commerce','code_travail','csp','code_fiscal','code_article') THEN 'loi_ordinaire'
        WHEN category IN ('codes','legislation','jort') THEN 'loi_ordinaire'
        WHEN subcategory IN ('decret_loi','decret') THEN 'marsoum'
        WHEN subcategory IN ('decret_gouvernemental','ordre_presidentiel') THEN 'ordre_reglementaire'
        WHEN subcategory IN ('arrete','circulaire') THEN 'arrete_ministeriel'
        ELSE 'loi_ordinaire'
      END::norm_level,
      updated_at = NOW()
    WHERE doc_type = 'TEXTES' AND norm_level IS NULL AND is_active = true
    RETURNING id, category, subcategory
  `)
  console.log(`  ${normFix.rowCount} docs TEXTES → norm_level assigné`)
  for (const r of normFix.rows) {
    console.log(`    ${r.category.padEnd(15)} ${(r.subcategory||'null').padEnd(20)}`)
  }

  // 3. Sync chunks doc_type
  console.log('\n=== SYNC CHUNKS doc_type ===')
  const sync = await pool.query(`
    UPDATE knowledge_base_chunks kbc
    SET metadata = kbc.metadata || jsonb_build_object('doc_type', kb.doc_type::text)
    FROM knowledge_base kb
    WHERE kbc.knowledge_base_id = kb.id
      AND kb.is_active = true
      AND kbc.metadata->>'doc_type' IS DISTINCT FROM kb.doc_type::text
  `)
  console.log(`  ${sync.rowCount} chunks synced`)

  // 4. Vérification finale
  console.log('\n=== ÉTAT FINAL ===')
  const check = await pool.query(`
    SELECT category, doc_type, COUNT(*) as n
    FROM knowledge_base WHERE is_active=true
    GROUP BY category, doc_type ORDER BY category, n DESC
  `)
  for (const r of check.rows) {
    const ok = isCorrect(r.category, r.doc_type)
    const flag = ok ? '' : ' ⚠️'
    console.log(`  ${r.category.padEnd(20)} | ${(r.doc_type||'NULL').padEnd(10)} | ${r.n}${flag}`)
  }

  await pool.end()
}

function isCorrect(cat: string, type: string): boolean {
  const map: Record<string, string> = {
    legislation: 'TEXTES', codes: 'TEXTES', constitution: 'TEXTES',
    conventions: 'TEXTES', jort: 'TEXTES',
    jurisprudence: 'JURIS',
    procedures: 'PROC', formulaires: 'PROC',
    modeles: 'TEMPLATES',
    doctrine: 'DOCTRINE', guides: 'DOCTRINE', lexique: 'DOCTRINE',
    actualites: 'DOCTRINE', autre: 'DOCTRINE',
  }
  return map[cat] === type || !map[cat]
}

main().catch(e => { console.error(e); process.exit(1) })
