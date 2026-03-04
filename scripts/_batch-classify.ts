import { Pool } from 'pg'

const pool = new Pool({ 
  connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya',
  max: 3 
})

const OFFSET = parseInt(process.env.OFFSET || '0', 10)
const CATEGORY = process.env.CATEGORY || 'doctrine'
const DOC_TYPE = process.env.DOC_TYPE || 'DOCTRINE'

async function main() {
  const r = await pool.query(
    `SELECT id, title FROM knowledge_base WHERE category='google_drive' AND is_active=true ORDER BY created_at DESC OFFSET $1 LIMIT 30`,
    [OFFSET]
  )
  const ids = r.rows.map((x: any) => x.id)
  console.log(`Batch offset=${OFFSET}: ${ids.length} docs`)
  
  if (ids.length === 0) { console.log('DONE'); await pool.end(); return }
  
  const meta = JSON.stringify({ 
    classification_source: 'claude_live', 
    reclassified_at: new Date().toISOString(), 
    old_category: 'google_drive', 
    doc_type: DOC_TYPE 
  })
  
  const upd = await pool.query(
    `UPDATE knowledge_base SET category=$1::text, doc_type=$2::document_type, metadata=COALESCE(metadata,'{}'::jsonb)||$3::jsonb, updated_at=NOW() WHERE id=ANY($4::uuid[]) RETURNING id`,
    [CATEGORY, DOC_TYPE, meta, ids]
  )
  console.log('KB updated:', upd.rowCount)
  
  const chunks = await pool.query(
    `UPDATE knowledge_base_chunks kbc SET metadata=kbc.metadata||jsonb_build_object('doc_type',$1) FROM knowledge_base kb WHERE kbc.knowledge_base_id=kb.id AND kb.id=ANY($2::uuid[]) AND kbc.metadata->>'doc_type' IS DISTINCT FROM $1`,
    [DOC_TYPE, ids]
  )
  console.log('Chunks synced:', chunks.rowCount)
  
  await pool.end()
}

main().catch(console.error)
