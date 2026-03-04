import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })
async function main() {
  const r = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation',
      doc_type = 'TEXTES',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('doc_type','TEXTES'),
      updated_at = NOW()
    WHERE id = '4e2fdad1-71f1-47fa-ad9a-2342a361f4e5'
    RETURNING id, title, category`)
  console.log('Fixed:', r.rows[0]?.category, r.rows[0]?.title?.substring(0, 60))
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
