import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  // 1. Fix codes avec arrete_ministeriel → loi_ordinaire
  // (Notes communes / circulaires classées dans 'codes' par erreur)
  const fix1 = await pool.query(`
    UPDATE knowledge_base SET norm_level = 'loi_ordinaire', updated_at = NOW()
    WHERE category = 'codes' AND norm_level = 'arrete_ministeriel' AND is_active = true
    RETURNING id, LEFT(title,60) as title`)
  console.log(`codes arrete_ministeriel → loi_ordinaire: ${fix1.rowCount}`)
  for (const r of fix1.rows) console.log(`  ${r.title}`)

  // 2. Fix conventions avec mauvais norm_level (vérification)
  const convCheck = await pool.query(`
    SELECT norm_level, COUNT(*) FROM knowledge_base
    WHERE category='conventions' AND is_active=true GROUP BY norm_level`)
  console.log('\nconventions par norm_level:')
  for (const r of convCheck.rows) console.log(`  ${r.norm_level}: ${r.count}`)

  // 3. Vérifier constitution (déjà corrigé partiellement)
  const cstCheck = await pool.query(`
    SELECT norm_level, COUNT(*) FROM knowledge_base
    WHERE category='constitution' AND is_active=true GROUP BY norm_level`)
  console.log('\nconstitution par norm_level:')
  for (const r of cstCheck.rows) console.log(`  ${r.norm_level}: ${r.count}`)

  // 4. Sync norm_level vers chunks
  const sync = await pool.query(`
    UPDATE knowledge_base_chunks kbc
    SET metadata = kbc.metadata || jsonb_build_object('norm_level', kb.norm_level::text)
    FROM knowledge_base kb
    WHERE kbc.knowledge_base_id = kb.id
      AND kb.is_active = true
      AND kb.norm_level IS NOT NULL
      AND kbc.metadata->>'norm_level' IS DISTINCT FROM kb.norm_level::text`)
  console.log(`\nChunks norm_level synced: ${sync.rowCount}`)

  // 5. État final
  console.log('\n=== ÉTAT FINAL norm_level (TEXTES) ===')
  const final = await pool.query(`
    SELECT norm_level, COUNT(*) as n FROM knowledge_base
    WHERE is_active=true AND doc_type='TEXTES'
    GROUP BY norm_level ORDER BY n DESC`)
  for (const r of final.rows)
    console.log(`  ${(r.norm_level||'NULL').padEnd(25)} : ${r.n}`)

  // 6. Vérification globale
  const nullLeft = await pool.query(`
    SELECT COUNT(*) FROM knowledge_base WHERE norm_level IS NULL AND doc_type='TEXTES' AND is_active=true`)
  console.log(`\nTEXTES sans norm_level restants: ${nullLeft.rows[0].count}`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
