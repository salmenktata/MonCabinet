import { Pool } from 'pg'

const pool = new Pool({ 
  connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya',
  max: 3 
})

async function main() {
  // 1. Classifier قانون مجلة الجماعات المحلية comme legislation (loi organique)
  const r1 = await pool.query(
    `SELECT id FROM knowledge_base WHERE title LIKE '%مجلة الجماعات المحلية%' AND category='google_drive' AND is_active=true`
  )
  const legIds = r1.rows.map((x: any) => x.id)
  console.log('Legislation IDs:', legIds.length)
  
  if (legIds.length > 0) {
    const meta = JSON.stringify({ classification_source: 'claude_live', reclassified_at: new Date().toISOString(), old_category: 'google_drive', doc_type: 'TEXTES' })
    const upd = await pool.query(
      `UPDATE knowledge_base SET category='legislation', doc_type='TEXTES', metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb, updated_at=NOW() WHERE id=ANY($2::uuid[])`,
      [meta, legIds]
    )
    console.log('Legislation KB updated:', upd.rowCount)
    const chunks = await pool.query(
      `UPDATE knowledge_base_chunks kbc SET metadata=kbc.metadata||jsonb_build_object('doc_type','TEXTES') FROM knowledge_base kb WHERE kbc.knowledge_base_id=kb.id AND kb.id=ANY($1::uuid[])`,
      [legIds]
    )
    console.log('Legislation chunks synced:', chunks.rowCount)
  }

  // 2. Classifier les 29 autres docs de l'offset 210 comme doctrine
  const r2 = await pool.query(
    `SELECT id FROM knowledge_base WHERE category='google_drive' AND is_active=true ORDER BY created_at DESC OFFSET 210 LIMIT 30`
  )
  const allIds = r2.rows.map((x: any) => x.id)
  const doctrineIds = allIds.filter((id: string) => !legIds.includes(id))
  console.log('Doctrine IDs:', doctrineIds.length)
  
  if (doctrineIds.length > 0) {
    const meta = JSON.stringify({ classification_source: 'claude_live', reclassified_at: new Date().toISOString(), old_category: 'google_drive', doc_type: 'DOCTRINE' })
    const upd = await pool.query(
      `UPDATE knowledge_base SET category='doctrine', doc_type='DOCTRINE', metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb, updated_at=NOW() WHERE id=ANY($2::uuid[])`,
      [meta, doctrineIds]
    )
    console.log('Doctrine KB updated:', upd.rowCount)
    const chunks = await pool.query(
      `UPDATE knowledge_base_chunks kbc SET metadata=kbc.metadata||jsonb_build_object('doc_type','DOCTRINE') FROM knowledge_base kb WHERE kbc.knowledge_base_id=kb.id AND kb.id=ANY($1::uuid[]) AND kbc.metadata->>'doc_type' IS DISTINCT FROM 'DOCTRINE'`,
      [doctrineIds]
    )
    console.log('Doctrine chunks synced:', chunks.rowCount)
  }
  
  await pool.end()
}

main().catch(console.error)
