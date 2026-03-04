import { Pool } from 'pg'

const pool = new Pool({ 
  connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya',
  max: 3 
})

async function main() {
  // 1. Lexique doc
  const r1 = await pool.query(
    `SELECT id FROM knowledge_base WHERE title LIKE '%Lexique Droit concurrence%' AND category='google_drive' AND is_active=true`
  )
  const lexIds = r1.rows.map((x: any) => x.id)
  console.log('Lexique IDs:', lexIds.length)
  
  if (lexIds.length > 0) {
    const meta = JSON.stringify({ classification_source: 'claude_live', reclassified_at: new Date().toISOString(), old_category: 'google_drive', doc_type: 'DOCTRINE' })
    const upd = await pool.query(
      `UPDATE knowledge_base SET category='lexique', doc_type='DOCTRINE', metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb, updated_at=NOW() WHERE id=ANY($2::uuid[])`,
      [meta, lexIds]
    )
    console.log('Lexique KB updated:', upd.rowCount)
  }

  // 2. Les 29 autres → doctrine
  const r2 = await pool.query(
    `SELECT id FROM knowledge_base WHERE category='google_drive' AND is_active=true ORDER BY created_at DESC OFFSET 300 LIMIT 30`
  )
  const allIds = r2.rows.map((x: any) => x.id)
  const doctrineIds = allIds.filter((id: string) => !lexIds.includes(id))
  console.log('Doctrine IDs:', doctrineIds.length)
  
  if (doctrineIds.length > 0) {
    const meta = JSON.stringify({ classification_source: 'claude_live', reclassified_at: new Date().toISOString(), old_category: 'google_drive', doc_type: 'DOCTRINE' })
    const upd = await pool.query(
      `UPDATE knowledge_base SET category='doctrine', doc_type='DOCTRINE', metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb, updated_at=NOW() WHERE id=ANY($2::uuid[])`,
      [meta, doctrineIds]
    )
    console.log('Doctrine KB updated:', upd.rowCount)
  }
  
  await pool.end()
}

main().catch(console.error)
