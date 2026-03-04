import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  // 1. Inspecter les docs avec norm_level = 'decret_presidentiel'
  const dps = await pool.query(`
    SELECT id, LEFT(title,80) as title, subcategory, norm_level
    FROM knowledge_base WHERE norm_level = 'decret_presidentiel' AND is_active=true LIMIT 10`)
  console.log('=== decret_presidentiel docs ===')
  for (const r of dps.rows) console.log(`  ${r.subcategory||'null'} | ${r.title}`)

  // 2. Inspecter les constitution avec loi_ordinaire
  const cst = await pool.query(`
    SELECT id, LEFT(title,80) as title, subcategory
    FROM knowledge_base WHERE category='constitution' AND norm_level='loi_ordinaire' AND is_active=true`)
  console.log('\n=== constitution avec norm_level=loi_ordinaire ===')
  for (const r of cst.rows) console.log(`  ${r.subcategory||'null'} | ${r.title}`)

  // 3. Inspecter les codes avec arrete_ministeriel
  const codes = await pool.query(`
    SELECT id, LEFT(title,80) as title, subcategory
    FROM knowledge_base WHERE category='codes' AND norm_level='arrete_ministeriel' AND is_active=true`)
  console.log('\n=== codes avec norm_level=arrete_ministeriel ===')
  for (const r of codes.rows) console.log(`  ${r.subcategory||'null'} | ${r.title}`)

  // 4. CORRECTIONS
  console.log('\n=== CORRECTIONS ===')

  // Fix: constitution avec norm_level wrong → constitution
  const fix1 = await pool.query(`
    UPDATE knowledge_base SET norm_level = 'constitution', updated_at = NOW()
    WHERE category = 'constitution' AND norm_level != 'constitution' AND is_active = true
    RETURNING id`)
  console.log(`constitution norm_level fixés: ${fix1.rowCount}`)

  // Fix: decret_presidentiel → marsoum (ancienne valeur, force législative)
  const fix2 = await pool.query(`
    UPDATE knowledge_base SET norm_level = 'marsoum', updated_at = NOW()
    WHERE norm_level = 'decret_presidentiel' AND is_active = true
    RETURNING id`)
  console.log(`decret_presidentiel → marsoum: ${fix2.rowCount}`)

  // Fix: codes avec arrete_ministeriel → loi_ordinaire (les codes sont des lois)
  const fix3 = await pool.query(`
    UPDATE knowledge_base SET norm_level = 'loi_ordinaire', updated_at = NOW()
    WHERE category = 'codes' AND norm_level = 'arrete_ministeriel' AND is_active = true
    RETURNING id`)
  console.log(`codes arrete_ministeriel → loi_ordinaire: ${fix3.rowCount}`)

  // 5. Sync norm_level vers chunks
  const sync = await pool.query(`
    UPDATE knowledge_base_chunks kbc
    SET metadata = kbc.metadata || jsonb_build_object('norm_level', kb.norm_level::text)
    FROM knowledge_base kb
    WHERE kbc.knowledge_base_id = kb.id
      AND kb.is_active = true
      AND kb.norm_level IS NOT NULL
      AND kbc.metadata->>'norm_level' IS DISTINCT FROM kb.norm_level::text`)
  console.log(`\nChunks norm_level synced: ${sync.rowCount}`)

  // 6. Vérification finale
  console.log('\n=== ÉTAT FINAL norm_level (TEXTES) ===')
  const final = await pool.query(`
    SELECT norm_level, COUNT(*) as n FROM knowledge_base
    WHERE is_active=true AND doc_type='TEXTES'
    GROUP BY norm_level ORDER BY n DESC`)
  for (const r of final.rows)
    console.log(`  ${(r.norm_level||'NULL').padEnd(25)} : ${r.n}`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
